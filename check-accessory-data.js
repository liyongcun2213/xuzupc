const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 检查配件采购数据
console.log('\n=== 检查配件采购数据 ===');
db.query(`
    SELECT 
        DATE_FORMAT(pb.purchase_date, '%Y-%m') AS month,
        COUNT(*) AS batch_count,
        SUM(pai.quantity) AS total_quantity,
        SUM(pai.quantity * pai.unit_price) AS total_value
    FROM purchase_accessory_items pai
    JOIN purchase_batches pb ON pai.batch_id = pb.id
    GROUP BY DATE_FORMAT(pb.purchase_date, '%Y-%m')
    ORDER BY month ASC
    LIMIT 12
`, (err, results) => {
    if (err) {
        console.error('查询失败:', err);
        process.exit(1);
    }
    
    if (results.length === 0) {
        console.log('没有找到任何配件采购数据');
    } else {
        console.log('找到以下配件采购数据:');
        results.forEach(row => {
            console.log(`${row.month}: ${row.batch_count}批次, ${row.total_quantity}件, 总价¥${row.total_value}`);
        });
    }
    
    // 检查配件表数据
    console.log('\n=== 检查配件表数据 ===');
    db.query(`
        SELECT COUNT(*) AS total_accessories
        FROM accessories
    `, (err, results) => {
        if (err) {
            console.error('查询失败:', err);
            process.exit(1);
        }
        
        console.log(`配件表中共有 ${results[0].total_accessories} 种配件`);
        
        // 检查配件类别
        db.query(`
            SELECT ac.name, COUNT(a.id) AS count
            FROM accessories a
            JOIN accessory_categories ac ON a.category_id = ac.id
            GROUP BY ac.name
        `, (err, results) => {
            if (err) {
                console.error('查询失败:', err);
                process.exit(1);
            }
            
            console.log('\n按类别统计:');
            results.forEach(row => {
                console.log(`${row.name}: ${row.count} 种`);
            });
            
            process.exit(0);
        });
    });
});