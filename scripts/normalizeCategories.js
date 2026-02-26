/**
 * Script untuk normalize kategori di database
 * Mengubah "Katagori-X" menjadi "Kategori-X" (fix spelling)
 */

const { connectDB } = require('../autofix-db');

async function normalizeCategories() {
  console.log('=== Normalizing Categories (Katagori → Kategori) ===\n');

  try {
    const connection = await connectDB();
    const client = connection.client;
    const db = client.db('iptv');

    // 1. Update ml_predictions collection
    console.log('1. Updating ml_predictions collection...');
    const mlResult = await db.collection('ml_predictions').updateMany(
      {
        predictedCategory: { $regex: /^Katagori-/ }
      },
      [
        {
          $set: {
            predictedCategory: {
              $replaceAll: {
                input: "$predictedCategory",
                find: "Katagori-",
                replacement: "Kategori-"
              }
            },
            "probabilities": {
              $map: {
                input: "$probabilities",
                in: {
                  label: {
                    $replaceAll: {
                      input: "$$this.label",
                      find: "Katagori-",
                      replacement: "Kategori-"
                    }
                  },
                  probability: "$$this.probability"
                }
              }
            }
          }
        }
      ]
    );
    console.log(`   Updated ${mlResult.modifiedCount} ML predictions`);

    // 2. Update notifications collection
    console.log('\n2. Updating notifications collection...');
    const notifResult = await db.collection('notifications').updateMany(
      {
        errorCategory: { $regex: /^Katagori-/ }
      },
      [
        {
          $set: {
            errorCategory: {
              $replaceAll: {
                input: "$errorCategory",
                find: "Katagori-",
                replacement: "Kategori-"
              }
            }
          }
        }
      ]
    );
    console.log(`   Updated ${notifResult.modifiedCount} notifications`);

    // 3. Update auto_fix_logs collection
    console.log('\n3. Updating auto_fix_logs collection...');
    const fixResult = await db.collection('auto_fix_logs').updateMany(
      {
        category: { $regex: /^Katagori-/ }
      },
      [
        {
          $set: {
            category: {
              $replaceAll: {
                input: "$category",
                find: "Katagori-",
                replacement: "Kategori-"
              }
            }
          }
        }
      ]
    );
    console.log(`   Updated ${fixResult.modifiedCount} auto-fix logs`);

    // 4. Verify changes
    console.log('\n4. Verifying changes...');
    const mlCategories = await db.collection('ml_predictions').distinct('predictedCategory');
    const notifCategories = await db.collection('notifications').distinct('errorCategory');
    const fixCategories = await db.collection('auto_fix_logs').distinct('category');

    console.log('\n✅ Normalization Complete!\n');
    console.log('Current Categories in Collections:');
    console.log('ML Predictions:', mlCategories.filter(c => c).join(', '));
    console.log('Notifications:', notifCategories.filter(c => c).join(', '));
    console.log('Auto-Fix Logs:', fixCategories.filter(c => c).join(', '));

    console.log('\n⚠️  Note: ML model needs to be retrained with correct spelling "Kategori"');
    console.log('   Training file should use "Kategori-1" instead of "Katagori-1"');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
normalizeCategories()
  .then(() => {
    console.log('\n=== Script Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
