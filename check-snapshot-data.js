const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 查询asset_snapshots表中的数据，特别是2025年的
console.log('\n=== 查询2025年的资产快照数据 ===');
db.query(`
    SELECT 
        snapshot_date,
        DATE_FORMAT(snapshot_date, '%Y-%m') AS formatted_date,
        YEAR(snapshot_date) AS year,
        MONTH(snapshot_date) AS month,
        accessory_count,
        accessory_total_value
    FROM asset_snapshots 
    WHERE YEAR(snapshot_date) = 2025
    ORDER BY snapshot_date DESC
`, (err, results) => {
    if (err) {
        console.error('查询失败:', err);
        process.exit(1);
    }
    
    if (results.length === 0) {
        console.log('没有找到2025年的快照数据');
    } else {
        console.log(`找到${results.length}条2025年的快照数据:`);
        results.forEach(row => {
            console.log(`${row.formatted_date}: ${row.accessory_count}件, ¥${row.accessory_total_value}`);
        });
    }
    
    // 测试API查询
    console.log('\n=== 测试API查询 ===');
    db.query(`
        SELECT 
            DATE_FORMAT(snapshot_date, '%Y-%m') AS record_date,
            accessory_total_value AS total_value,
            accessory_count AS total_quantity
        FROM asset_snapshots 
        WHERE YEAR(snapshot_date) = 2025
        ORDER BY snapshot_date DESC
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