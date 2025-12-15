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
    console.log('已连接到数据库');

    // 步骤1: 删除旧的外键约束
    const dropFK = `
        ALTER TABLE rent_received_records 
        DROP FOREIGN KEY rent_received_records_ibfk_1
    `;

    db.query(dropFK, (err) => {
        if (err && err.errno !== 1091) { // 1091 = Can't DROP, check if exists
            console.error('删除外键约束失败:', err);
            db.end();
            process.exit(1);
        }
        console.log('✓ 已删除旧的外键约束');

        // 步骤2: 添加新的外键约束，引用 customer_bills 表
        const addFK = `
            ALTER TABLE rent_received_records 
            ADD CONSTRAINT rent_received_records_ibfk_1 
            FOREIGN KEY (bill_id) REFERENCES customer_bills(id)
        `;

        db.query(addFK, (err) => {
            if (err) {
                console.error('添加新外键约束失败:', err);
                db.end();
                process.exit(1);
            }
            console.log('✓ 已添加新的外键约束（引用 customer_bills 表）');

            // 验证外键约束
            db.query('SHOW CREATE TABLE rent_received_records', (err, results) => {
                if (err) {
                    console.error('验证失败:', err);
                } else {
                    console.log('\n当前表结构:');
                    console.log(results[0]['Create Table']);
                }
                
                db.end();
                console.log('\n✓ 修复完成！');
            });
        });
    });
});
