import { ModerationMix } from '../index.js';
try { process.loadEnvFile(); } catch {}

const username = 'player_name';
const avatarUrl = 'https://example.com/avatar.png';

const { moderation: [profileModeration] } = await ModerationMix.new()
    .openai()
    .addText(username)
    .addImageFromUrl(avatarUrl)
    .raw();

console.log({
    allowed: !profileModeration.flagged,
    categories: profileModeration.categories,
    scores: profileModeration.category_scores
});
