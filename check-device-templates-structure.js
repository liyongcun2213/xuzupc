const mysql = require('mysql');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
};

function checkDeviceTemplatesStructure() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查设备模板表结构...\n');
    
    connection.query('DESCRIBE device_templates', (err, result) => {
        if (err) {
            console.error('查询device_templates表结构失败:', err);
            connection.end();
            return;
        }
        
        console.log('device_templates表结构:');
        result.forEach(column => {
            console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
        });
        
        connection.end();
        
        console.log('\n根据表结构，我们需要修改SQL插入语句');
    });
}

// 运行检查
checkDeviceTemplatesStructure();