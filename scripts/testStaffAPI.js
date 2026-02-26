/**
 * Test staff API response
 */

const { connectDB } = require('../autofix-db');

(async () => {
  const connection = await connectDB();
  const db = connection.client.db('iptv');

  // Get raw staff data
  const staff = await db.collection('staff').findOne({
    name: 'Sidin Rahman'
  });

  console.log('=== RAW STAFF DATA FROM DB ===');
  console.log(JSON.stringify(staff, null, 2));

  // Simulate API response (getAllStaff logic)
  const staffList = await db.collection('staff').find({
    isActive: { $ne: false }
  }).toArray();

  const staffWithStats = staffList.map((member) => {
    const stats = member.stats || {
      totalAssigned: 0,
      totalResolved: 0,
      avgResolutionTime: 0,
      successRate: 0
    };

    return {
      _id: member._id.toString(),
      userId: member.userId ? member.userId.toString() : null,
      name: member.name,
      email: member.email,
      phone: member.phone,
      department: member.department,
      position: member.position,
      isActive: member.isActive,
      avatar: member.avatar || null,
      employeeId: member.employeeId || null,
      joinedDate: member.joinedDate,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      stats
    };
  });

  console.log('\n=== API RESPONSE (getAllStaff) ===');
  const sidin = staffWithStats.find(s => s.name === 'Sidin Rahman');
  console.log(JSON.stringify(sidin, null, 2));

  process.exit(0);
})();
