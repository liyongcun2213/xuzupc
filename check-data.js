const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

connection.connect(err => {
    if (err) {
        console.log('数据库连接失败:', err.message);
        return;
    }
    
    console.log('数据库连接成功');
    
    // 检查配件类别
    connection.query('SELECT * FROM accessory_categories', (err, categories) => {
        if (err) {
            console.log('查询配件类别失败:', err.message);
            connection.end();
            return;
        }
        
        console.log('\n配件类别:');
        categories.forEach(cat => {
            console.log(`ID: ${cat.id}, 名称: ${cat.name}`);
        });
        
        // 检查配件数据
        connection.query('SELECT a.*, ac.name as category_name FROM accessories a LEFT JOIN accessory_categories ac ON a.category_id = ac.id LIMIT 10', (err, accessories) => {
            if (err) {
                console.log('查询配件失败:', err.message);
                connection.end();
                return;
            }
            
            console.log('\n配件数据:');
            if (accessories.length === 0) {
                console.log('没有找到任何配件数据');
            } else {
                accessories.forEach(acc => {
                    console.log(`ID: ${acc.id}, 名称: ${acc.name}, 类别: ${acc.category_name || '未知'}`);
                });
            }
            
            connection.end();
        });
    });
});