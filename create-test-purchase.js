const mysql = require('mysql');
const moment = require('moment');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: true
};

function createTestPurchase() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    // 生成批次号
    const today = moment().format('YYYYMMDD');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const batchNo = `PO${today}${randomSuffix}`;
    
    console.log(`创建测试采购批次: ${batchNo}...\n`);
    
    // 创建一个测试采购批次
    connection.query(`
        INSERT INTO purchase_batches (
            batch_no, supplier_id, purchase_date, expected_delivery_date, 
            total_amount, paid_amount, status, notes, created_by, created_at
        ) VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), ?, 0.00, 'pending', '测试采购批次，用于测试删除功能', 1, NOW())
    `, [batchNo, 1, 1000.00], (err, result) => {
        if (err) {
            console.error('创建采购批次失败:', err);
            connection.end();
            return;
        }
        
        const batchId = result.insertId;
        console.log(`成功创建采购批次，ID: ${batchId}`);
        
        // 关闭连接
        connection.end();
        
        console.log('\n测试采购批次创建成功！');
        console.log('现在您可以在采购管理页面看到这个待审批的批次，并测试删除功能');
        console.log('请访问: http://localhost:3000/purchases');
    });
}

// 运行创建
createTestPurchase();