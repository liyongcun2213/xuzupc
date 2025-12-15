const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

console.log('连接到MySQL数据库...');

// 检查asset_snapshots表结构
console.log('\n=== 检查asset_snapshots表结构 ===');
db.query('DESCRIBE asset_snapshots', (err, results) => {
    if (err) {
        console.error('查询表结构失败:', err);
        process.exit(1);
    }
    
    console.log('asset_snapshots表结构:');
    results.forEach(column => {
        console.log(`${column.Field}: ${column.Type} ${column.Null ? 'NULL' : 'NOT NULL'} ${column.Default ? `DEFAULT ${column.Default}` : ''}`);
    });
    
    process.exit(0);
});