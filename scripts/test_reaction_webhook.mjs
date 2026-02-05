/**
 * Test script for WhatsApp Reaction Webhook
 * Simulates the 5 acceptance test scenarios
 * 
 * Usage: node scripts/test_reaction_webhook.mjs
 */

const fs = require('fs');
const path = require('path');

// Read .env
const realEnvPath = path.join(__dirname, '.env');
const envPath = fs.existsSync(realEnvPath) ? realEnvPath : path.join(__dirname, 'env.example');
console.log(`📄 Reading env from: ${envPath}`);

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_FUNCTION_URL = env.SUPABASE_FUNCTION_URL;
const WEBHOOK_SECRET = env.WEBHOOK_SECRET;
const INSTANCE_NAME = env.INSTANCE_NAME || 'solarzap_test_instance';
const OWNER_PHONE = env.OWNER_PHONE || '5511999999999'; // Phone number of instance owner

if (!SUPABASE_FUNCTION_URL) {
    console.error('❌ SUPABASE_FUNCTION_URL not found in .env');
    process.exit(1);
}

// Test message ID (should exist in your interacoes table)
const TEST_MESSAGE_ID = env.TEST_MESSAGE_ID || 'TEST_MSG_123';

async function sendReaction(emoji, reactorPhone, testName) {
    const url = `${SUPABASE_FUNCTION_URL}?token=${WEBHOOK_SECRET}`;

    // Determine if reactor is the owner
    const isFromMe = reactorPhone === OWNER_PHONE;

    const payload = {
        event: "MESSAGES_UPSERT",
        instance: INSTANCE_NAME,
        data: {
            key: {
                remoteJid: `${reactorPhone}@s.whatsapp.net`,
                fromMe: isFromMe,
                participant: `${reactorPhone}@s.whatsapp.net`
            },
            participant: `${reactorPhone}@s.whatsapp.net`,
            messageType: "reactionMessage",
            message: {
                reactionMessage: {
                    key: {
                        id: TEST_MESSAGE_ID
                    },
                    text: emoji // Empty string = remove
                }
            }
        }
    };

    console.log(`\n📤 [${testName}] Sending reaction: emoji="${emoji || '(remove)'}", reactor=${reactorPhone}, fromMe=${isFromMe}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`📥 Response: ${response.status} ${text}`);

        if (response.ok) {
            console.log(`✅ [${testName}] Webhook accepted`);
        } else {
            console.error(`❌ [${testName}] Webhook rejected`);
        }
    } catch (error) {
        console.error(`❌ [${testName}] Network Error:`, error.message);
    }

    // Wait between tests
    await new Promise(r => setTimeout(r, 1000));
}

async function runTests() {
    console.log('🧪 Starting Reaction Webhook Tests\n');
    console.log(`Instance: ${INSTANCE_NAME}`);
    console.log(`Owner Phone: ${OWNER_PHONE}`);
    console.log(`Target Message: ${TEST_MESSAGE_ID}`);
    console.log('='.repeat(50));

    // T1: Owner reacts ❤️ → should have 1 reaction
    await sendReaction('❤️', OWNER_PHONE, 'T1: Owner reacts ❤️');

    // T2: Owner changes to 😂 → should still have 1 reaction (replaced)
    await sendReaction('😂', OWNER_PHONE, 'T2: Owner changes to 😂');

    // T3: Another user reacts ❤️ → should have 2 reactions
    const OTHER_USER = '5511888888888';
    await sendReaction('❤️', OTHER_USER, 'T3: Other user reacts ❤️');

    // T4: Owner removes reaction → should go back to 1 reaction
    await sendReaction('', OWNER_PHONE, 'T4: Owner removes reaction');

    // T5: Repeat same event (idempotency) → should still have 1 reaction
    await sendReaction('❤️', OTHER_USER, 'T5: Duplicate webhook (same event)');

    console.log('\n' + '='.repeat(50));
    console.log('🧪 Tests completed. Check your database:');
    console.log(`SELECT id, reactions FROM interacoes WHERE wa_message_id = '${TEST_MESSAGE_ID}';`);
    console.log('\n✅ Expected: No two reactions with same reactorId');
}

runTests();
