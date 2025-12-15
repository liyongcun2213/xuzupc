const db = require('mysql').createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.query('SELECT COUNT(*) AS count FROM accessory_asset_snapshots', (err, results) => {
    if (err) {
        console.error('查询失败:', err);
    } else {
        console.log('快照记录数:', results[0].count);
    }
    
    db.query('SELECT snapshot_month, total_accessory_total_value FROM accessory_asset_snapshots ORDER BY snapshot_month DESC LIMIT 5', (err, results) => {
        if (err) {
            console.error('查询失败:', err);
        } else {
            console.log('最近5条快照:');
            results.forEach(row => {
                console.log('月份:', row.snapshot_month, '总价值:', row.total_accessory_total_value);
            });
        }
        db.end();
    });
});