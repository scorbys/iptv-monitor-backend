const { connectDB } = require('../autofix-db');
const { ObjectId } = require('mongodb');

(async () => {
  const connection = await connectDB();
  const db = connection.client.db('iptv');

  // Check notifications with staff assignments
  const notifsWithStaff = await db.collection('notifications').find({
    assignedStaffId: { $exists: true, $ne: null }
  }).limit(5).toArray();

  console.log('=== NOTIFICATIONS WITH STAFF ASSIGNMENTS ===');
  console.log(`Total assigned: ${notifsWithStaff.length}\n`);

  if (notifsWithStaff.length > 0) {
    // Get staff details
    const staffIds = notifsWithStaff.map(n => new ObjectId(n.assignedStaffId));
    const staffMembers = await db.collection('staff').find({
      _id: { $in: staffIds }
    }).toArray();

    const staffMap = {};
    staffMembers.forEach(s => {
      staffMap[s._id.toString()] = s.name;
    });

    notifsWithStaff.forEach(n => {
      const staffName = staffMap[n.assignedStaffId] || 'Unknown';
      console.log(`${n.notificationId}`);
      console.log(`  Message: ${n.message.substring(0, 60)}...`);
      console.log(`  Assigned: ${staffName}`);
      console.log(`  Category: ${n.errorCategory || 'No category'}`);
      console.log(`  Status: ${n.reportStatus}`);
      console.log();
    });
  }

  // Check updated staff stats
  console.log('=== STAFF STATS AFTER ASSIGNMENT ===');
  const staff = await db.collection('staff').find({
    deletedAt: { $exists: false }
  }).toArray();

  staff.forEach(s => {
    console.log(`${s.name}`);
    console.log(`  Total Assigned: ${s.stats?.totalAssigned || 0}`);
    console.log(`  Total Resolved: ${s.stats?.totalResolved || 0}`);
    console.log();
  });

  process.exit(0);
})();
