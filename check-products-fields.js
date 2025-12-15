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
        process.exit(1);
    }
    
    console.log('✓ 已连接到数据库\n');
    
    // 查看products表结构
    db.query('DESCRIBE products', (err, fields) => {
        if (err) {
            console.error('查询表结构失败:', err);
            db.end();
            return;
        }
        
        console.log('=== products表结构 ===');
        fields.forEach(field => {
            console.log(`${field.Field}\t${field.Type}\t${field.Null}\t${field.Default}`);
        });
        
        // 查询products数据
        db.query('SELECT * FROM products WHERE product_code = "PC0001" LIMIT 1', (err, results) => {
            if (err) {
                console.error('查询数据失败:', err);
                db.end();
                return;
            }
            
            console.log('\n=== PC0001产品数据 ===');
            console.log(JSON.stringify(results, null, 2));
            
            db.end();
        });
    });
});
