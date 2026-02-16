const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const { ModelMix } = require('../index.js');
const generateJsonSchema = require('../schema.js');


describe('JSON Schema and Structured Output Tests', () => {
    
    // Setup test hooks
    if (global.setupTestHooks) {
        global.setupTestHooks();
    }
    
    afterEach(() => {
        nock.cleanAll();
        sinon.restore();
    });

    describe('JSON Schema Generation', () => {
        it('should generate schema for simple object', () => {
            const example = {
                name: 'Alice',
                age: 30,
                isAdmin: false
            };
            
            const schema = generateJsonSchema(example);
            
            expect(schema).to.deep.equal({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                    isAdmin: { type: 'boolean' }
                },
                required: ['name', 'age', 'isAdmin']
            });
        });

        it('should generate schema with email format detection', () => {
            const example = { email: 'test@example.com' };
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.email).to.deep.equal({
                type: 'string',
                format: 'email'
            });
        });

        it('should generate schema with date format detection', () => {
            const example = { birthDate: '1990-01-01' };
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.birthDate).to.deep.equal({
                type: 'string',
                format: 'date',
                description: 'Date in format YYYY-MM-DD'
            });
        });

        it('should generate schema with time format detection', () => {
            const example = { 
                time1: '14:30',
                time2: '09:15:45'
            };
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.time1).to.deep.equal({
                type: 'string',
                format: 'time',
                description: 'Time in format HH:MM'
            });
            
            expect(schema.properties.time2).to.deep.equal({
                type: 'string',
                format: 'time',
                description: 'Time in format HH:MM:SS'
            });
        });

        it('should handle nested objects', () => {
            const example = {
                user: {
                    name: 'Bob',
                    preferences: {
                        theme: 'dark'
                    }
                }
            };
            
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.user.type).to.equal('object');
            expect(schema.properties.user.properties.name).to.deep.equal({ type: 'string' });
            expect(schema.properties.user.properties.preferences.type).to.equal('object');
        });

        it('should handle arrays of objects', () => {
            const example = {
                users: [{
                    name: 'Alice',
                    age: 30
                }]
            };
            
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.users).to.deep.equal({
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        age: { type: 'integer' }
                    },
                    required: ['name', 'age']
                }
            });
        });

        it('should handle arrays of primitives', () => {
            const example = {
                tags: ['admin', 'user'],
                numbers: [1, 2, 3]
            };
            
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.tags).to.deep.equal({
                type: 'array',
                items: { type: 'string' }
            });
            
            expect(schema.properties.numbers).to.deep.equal({
                type: 'array',
                items: { type: 'integer' }
            });
        });

        it('should handle custom descriptions', () => {
            const example = { name: 'Alice', age: 30 };
            const descriptions = {
                name: 'Full name of the user',
                age: 'User age in years'
            };
            
            const schema = generateJsonSchema(example, descriptions);
            
            expect(schema.properties.name.description).to.equal('Full name of the user');
            expect(schema.properties.age.description).to.equal('User age in years');
        });

        it('should handle null values', () => {
            const example = { data: null };
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.data).to.deep.equal({ type: 'null' });
        });

        it('should distinguish between integer and float', () => {
            const example = {
                count: 42,
                price: 19.99
            };
            
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.count).to.deep.equal({ type: 'integer' });
            expect(schema.properties.price).to.deep.equal({ type: 'number' });
        });

        it('should handle empty arrays', () => {
            const example = { items: [] };
            const schema = generateJsonSchema(example);
            
            expect(schema.properties.items).to.deep.equal({
                type: 'array',
                items: {}
            });
        });
    });

    describe('Enhanced Descriptor Descriptions', () => {
        it('should support required: false (not in required + nullable)', () => {
            const example = { name: 'Alice', nickname: 'Ali' };
            const descriptions = {
                name: 'Full name',
                nickname: { description: 'Optional nickname', required: false }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.required).to.deep.equal(['name']);
            expect(schema.properties.nickname).to.deep.equal({
                type: ['string', 'null'],
                description: 'Optional nickname'
            });
            expect(schema.properties.name).to.deep.equal({
                type: 'string',
                description: 'Full name'
            });
        });

        it('should support enum', () => {
            const example = { status: 'active' };
            const descriptions = {
                status: { description: 'Account status', enum: ['active', 'inactive', 'banned'] }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.status).to.deep.equal({
                type: 'string',
                description: 'Account status',
                enum: ['active', 'inactive', 'banned']
            });
            expect(schema.required).to.deep.equal(['status']);
        });

        it('should make type nullable when enum includes null', () => {
            const example = { sex: 'm' };
            const descriptions = {
                sex: { description: 'Gender', enum: ['m', 'f', null] }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.sex).to.deep.equal({
                type: ['string', 'null'],
                description: 'Gender',
                enum: ['m', 'f', null]
            });
        });

        it('should support default value', () => {
            const example = { theme: 'light' };
            const descriptions = {
                theme: { description: 'UI theme', default: 'light', enum: ['light', 'dark'] }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.theme).to.deep.equal({
                type: 'string',
                description: 'UI theme',
                default: 'light',
                enum: ['light', 'dark']
            });
        });

        it('should mix string and descriptor descriptions', () => {
            const example = { name: 'martin', age: 22, sex: 'm' };
            const descriptions = {
                name: { description: 'Name of the actor', required: false },
                age: 'Age of the actor',
                sex: { description: 'Gender', enum: ['m', 'f', null], default: 'm' }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.required).to.deep.equal(['age', 'sex']);
            expect(schema.properties.name).to.deep.equal({
                type: ['string', 'null'],
                description: 'Name of the actor'
            });
            expect(schema.properties.age).to.deep.equal({
                type: 'integer',
                description: 'Age of the actor'
            });
            expect(schema.properties.sex).to.deep.equal({
                type: ['string', 'null'],
                description: 'Gender',
                enum: ['m', 'f', null],
                default: 'm'
            });
        });

        it('should not apply descriptor as nested descriptions for objects', () => {
            const example = { user: { name: 'Alice', age: 30 } };
            const descriptions = {
                user: { description: 'User details', required: false }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.required).to.deep.equal([]);
            expect(schema.properties.user.description).to.equal('User details');
            expect(schema.properties.user.properties.name).to.deep.equal({ type: 'string' });
            expect(schema.properties.user.properties.age).to.deep.equal({ type: 'integer' });
        });

        it('should pass nested descriptions correctly for objects', () => {
            const example = { user: { name: 'Alice', age: 30 } };
            const descriptions = {
                user: { name: 'User name', age: 'User age' }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.user.properties.name).to.deep.equal({
                type: 'string',
                description: 'User name'
            });
            expect(schema.properties.user.properties.age).to.deep.equal({
                type: 'integer',
                description: 'User age'
            });
        });

        it('should handle array descriptions in array format', () => {
            const example = {
                countries: [{ name: 'France', capital: 'Paris' }]
            };
            const descriptions = {
                countries: [{ name: 'Country name', capital: 'Capital city' }]
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.countries.type).to.equal('array');
            expect(schema.properties.countries.items.properties.name.description).to.equal('Country name');
            expect(schema.properties.countries.items.properties.capital.description).to.equal('Capital city');
        });

        it('should handle descriptor for array field itself', () => {
            const example = { tags: ['admin'] };
            const descriptions = {
                tags: { description: 'User tags', required: false }
            };
            const schema = generateJsonSchema(example, descriptions);

            expect(schema.properties.tags.description).to.equal('User tags');
            expect(schema.required).to.deep.equal([]);
        });

        it('should not double-add null to type', () => {
            const example = { status: 'active' };
            const descriptions = {
                status: { required: false, enum: ['active', null] }
            };
            const schema = generateJsonSchema(example, descriptions);

            const nullCount = schema.properties.status.type.filter(t => t === 'null').length;
            expect(nullCount).to.equal(1);
        });
    });

    describe('ModelMix JSON Output', () => {
        let model;

        beforeEach(() => {
            model = ModelMix.new({
                config: { debug: false }
            });
        });

        it('should prepare JSON schema for structured output', async () => {
            const example = {
                countries: [{
                    name: 'France',
                    capital: 'Paris'
                }]
            };
            
            model.gpt41().addText('List 3 countries');
            
            // Mock the API response
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: JSON.stringify({
                                countries: [
                                    { name: 'France', capital: 'Paris' },
                                    { name: 'Germany', capital: 'Berlin' },
                                    { name: 'Spain', capital: 'Madrid' }
                                ]
                            })
                        }
                    }]
                });

            const result = await model.json(example);
            
            expect(result).to.have.property('countries');
            expect(result.countries).to.be.an('array');
            expect(result.countries).to.have.length(3);
            expect(result.countries[0]).to.have.property('name');
            expect(result.countries[0]).to.have.property('capital');
        });

        it('should handle complex nested JSON schema', async () => {
            const example = {
                user: {
                    personal: {
                        name: 'John',
                        age: 25
                    },
                    contact: {
                        email: 'john@example.com',
                        phone: '123-456-7890'
                    },
                    preferences: {
                        notifications: true,
                        theme: 'dark'
                    }
                },
                metadata: {
                    createdAt: '2023-01-01',
                    tags: ['premium', 'verified']
                }
            };

            model.sonnet4().addText('Generate user data');
            
            // Mock the API response
            nock('https://api.anthropic.com')
                .post('/v1/messages')
                .reply(200, {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(example)
                    }]
                });

            const result = await model.json(example);
            
            expect(result.user.personal.name).to.equal('John');
            expect(result.user.contact.email).to.equal('john@example.com');
            expect(result.metadata.tags).to.be.an('array');
            expect(result.metadata.tags).to.deep.equal(['premium', 'verified']);
        });

        it('should handle JSON parsing errors gracefully', async () => {
            model.gpt41().addText('Generate invalid JSON');
            
            // Mock invalid JSON response
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: 'This is not valid JSON'
                        }
                    }]
                });

            try {
                await model.json({ name: 'test' });
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('JSON');
            }
        });

        it('should auto-wrap top-level array and unwrap on return', async () => {
            model.gpt41().addText('List 3 countries');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: JSON.stringify({
                                out: [
                                    { name: 'France' },
                                    { name: 'Germany' },
                                    { name: 'Spain' }
                                ]
                            })
                        }
                    }]
                });

            const result = await model.json([{ name: 'France' }]);

            expect(result).to.be.an('array');
            expect(result).to.have.length(3);
            expect(result[0]).to.have.property('name', 'France');
            expect(result[2]).to.have.property('name', 'Spain');
        });
    });
});