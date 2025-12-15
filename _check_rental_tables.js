const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect((err) => {
    if (err) {
        console.error('数据库连接失败:', err);
        return;
    }
    
    console.log('数据库连接成功\n');
    console.log('查询所有包含 "rent" 的表名...\n');
    
    db.query("SHOW TABLES LIKE '%rent%'", (err, results) => {
        if (err) {
            console.error('查询失败:', err);
            db.end();
            return;
        }
        
        console.log('包含 "rent" 的表:');
        console.log('='.repeat(50));
        results.forEach(row => {
            const tableName = Object.values(row)[0];
            console.log(`  ✓ ${tableName}`);
        });
        
        console.log('\n查询所有表...\n');
        db.query("SHOW TABLES", (err, allTables) => {
            if (err) {
                console.error('查询失败:', err);
                db.end();
                return;
            }
            
            console.log('所有表名:');
            console.log('='.repeat(50));
            allTables.forEach(row => {
                const tableName = Object.values(row)[0];
                console.log(`  - ${tableName}`);
            });
            
            db.end();
        });
    });
});
