function requireProviderApiKey(customConfig, environmentVariable, providerName) {
    const apiKey = customConfig.apiKey || process.env[environmentVariable];
    if (!apiKey) {
        throw new Error(`${providerName} API key not found. Please provide it in config or set ${environmentVariable} environment variable.`);
    }
    return apiKey;
}

module.exports = { requireProviderApiKey };
