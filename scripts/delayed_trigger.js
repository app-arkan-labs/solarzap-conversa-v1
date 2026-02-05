
import { exec } from 'child_process';

console.log('⏳ Waiting 8 seconds before triggering webhook...');

setTimeout(() => {
    console.log('🚀 Triggering Webhook Simulation NOW!');
    exec('node scripts/simulate_webhook.js', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
    });
}, 8000);
