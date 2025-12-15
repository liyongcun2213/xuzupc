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
    
    console.log('数据库连接成功');
    
    // 查询客户
    db.query('SELECT * FROM customers ORDER BY name', (err, customers) => {
        if (err) {
            console.error('查询客户失败:', err);
            db.end();
            return;
        }
        
        console.log('\n客户列表:');
        console.log('共 ' + customers.length + ' 个客户\n');
        
        if (customers.length > 0) {
            console.log('ID\t客户名称\t\t\t联系人\t电话');
            console.log('--------------------------------------------------------------');
            customers.forEach(c => {
                console.log(c.id + '\t' + c.name + '\t\t' + (c.contact_person || '-') + '\t' + (c.phone || '-'));
            });
            
            console.log('\nJSON格式:');
            console.log(JSON.stringify(customers, null, 2));
        } else {
            console.log('没有客户数据！请先添加客户。');
        }
        
        db.end();
    });
});
