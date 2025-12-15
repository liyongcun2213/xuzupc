const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 直接查询asset_snapshots表的数据
console.log('\n=== 检查asset_snapshots表数据 ===');
db.query(`
    SELECT 
        snapshot_date,
        DATE_FORMAT(snapshot_date, '%Y-%m') AS formatted_date,
        device_count,
        device_total_value,
        accessory_count,
        accessory_total_value
    FROM asset_snapshots 
    ORDER BY snapshot_date DESC
    LIMIT 12
`, (err, results) => {
    if (err) {
        console.error('查询失败:', err);
        process.exit(1);
    }
    
    if (results.length === 0) {
        console.log('没有找到任何快照数据');
    } else {
        console.log('找到以下快照数据:');
        results.forEach(row => {
            console.log(`${row.formatted_date}: 设备${row.device_count}台(¥${row.device_total_value}), 配件${row.accessory_count}件(¥${row.accessory_total_value})`);
        });
    }
    
    // 测试我们的API查询
    console.log('\n=== 测试API查询 ===');
    db.query(`
        SELECT 
            DATE_FORMAT(snapshot_date, '%Y-%m') AS record_date,
            accessory_total_value AS total_value,
            accessory_count AS total_quantity
        FROM asset_snapshots 
        ORDER BY snapshot_date DESC
        LIMIT 12
    `, (err, apiResults) => {
        if (err) {
            console.error('API查询失败:', err);
            process.exit(1);
        }
        
        console.log('\nAPI查询结果:');
        apiResults.forEach(row => {
            console.log(`${row.record_date}: ¥${row.total_value}, ${row.total_quantity}件`);
        });
        
        process.exit(0);
    });
});