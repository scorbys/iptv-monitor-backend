#!/usr/bin/env node

/**
 * Quick Setup Script untuk Supabase Integration
 * Run: node backend/setup-supabase.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Supabase Integration Quick Setup      ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Check if .env exists
    const envPath = path.join(__dirname, '.env');
    let envExists = fs.existsSync(envPath);

    console.log('📋 Setup Configuration\n');

    // Get Supabase credentials
    const supabaseUrl = await question('? Supabase Project URL: ');
    const supabaseKey = await question('? Supabase Anon Key: ');
    const serviceRoleKey = await question('? Supabase Service Role Key (optional): ');
    
    console.log('\n⚙️  Sync Configuration\n');
    
    const enableSync = await question('✓ Enable Supabase Sync? (y/n): ');
    const syncStrategy = await question('✓ Sync Strategy (real-time/periodic/manual) [real-time]: ') || 'real-time';
    const twoWaySync = await question('✓ Enable Two-Way Sync? (y/n): ');

    // Build env content
    let envContent = '';

    if (envExists) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Add/Update Supabase config
    const supabaseConfig = `
# Supabase Configuration
SUPABASE_URL="${supabaseUrl}"
SUPABASE_KEY="${supabaseKey}"
${serviceRoleKey ? `SUPABASE_SERVICE_ROLE_KEY="${serviceRoleKey}"` : ''}

# Sync Configuration
ENABLE_SUPABASE_SYNC=${enableSync.toLowerCase() === 'y' ? 'true' : 'false'}
SYNC_STRATEGY="${syncStrategy}"
ENABLE_TWO_WAY_SYNC=${twoWaySync.toLowerCase() === 'y' ? 'true' : 'false'}`;

    // Check if config already exists
    if (envContent.includes('SUPABASE_URL')) {
      // Replace existing
      envContent = envContent.replace(
        /SUPABASE_URL=.+\nSUPABASE_KEY=.+(\nSUPABASE_SERVICE_ROLE_KEY=.+)?/,
        supabaseConfig.trim()
      );
    } else {
      // Append
      envContent += '\n' + supabaseConfig + '\n';
    }

    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ .env file updated successfully!\n');

    // Install dependencies
    console.log('📦 Installing dependencies...\n');
    const { execSync } = require('child_process');
    
    try {
      execSync('npm install @supabase/supabase-js', { 
        cwd: __dirname,
        stdio: 'inherit'
      });
      console.log('\n✅ Dependencies installed!\n');
    } catch (error) {
      console.error('⚠️  Failed to install dependencies. Please run: npm install @supabase/supabase-js\n');
    }

    // Display next steps
    console.log('╔════════════════════════════════════════╗');
    console.log('║          🎉 Setup Complete!           ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('📝 Next Steps:\n');
    console.log('1. Setup Supabase Database Schema:');
    console.log('   - Go to https://app.supabase.com');
    console.log('   - Open SQL Editor');
    console.log('   - Copy contents of: backend/config/supabase-schema.sql');
    console.log('   - Run the SQL query\n');

    console.log('2. Update your server.js:');
    console.log('   - Add route: app.use(\'/api/backup\', require(\'./api/backup/route\'));');
    console.log('   - Add init: const { initSupabase } = require(\'./config/supabase.config\');');
    console.log('   - Call: await initSupabase(); in startup\n');

    console.log('3. Integrate sync with db.js:');
    console.log('   - Use insertWithSync() instead of insertOne()');
    console.log('   - Use updateWithSync() instead of updateOne()');
    console.log('   - See: backend/docs/INTEGRATION_EXAMPLES.md\n');

    console.log('4. Test the setup:');
    console.log('   - npm run dev');
    console.log('   - curl http://localhost:3001/api/backup/status\n');

    console.log('📚 Documentation:');
    console.log('   - Setup Guide: backend/docs/SUPABASE_INTEGRATION.md');
    console.log('   - Examples: backend/docs/INTEGRATION_EXAMPLES.md\n');

    rl.close();

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
