const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

connection.connect();

// 检查表结构
connection.query('DESCRIBE products', (err, columns) => {
    if (err) {
        console.error('Error describing products table:', err);
        connection.end();
        return;
    }
    
    const columnNames = columns.map(col => col.Field);
    console.log('当前产品表列:', columnNames);
    
    // 检查每个需要的列
    const requiredColumns = [
        { name: 'printer_type', definition: "VARCHAR(100) COMMENT '打印机类型'" },
        { name: 'is_custom_config', definition: "BOOLEAN DEFAULT FALSE COMMENT '是否为自定义配置'" },
        { name: 'total_price', definition: "DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价格（配件组合时使用）'" },
        { name: 'calculated_daily_rent', definition: "DECIMAL(10,2) DEFAULT 0.00 COMMENT '计算得出的日租金'" },
        { name: 'calculated_monthly_rent', definition: "DECIMAL(10,2) DEFAULT 0.00 COMMENT '计算得出的月租金'" }
    ];
    
    let alterCount = 0;
    let completedCount = 0;
    
    requiredColumns.forEach(col => {
        if (!columnNames.includes(col.name)) {
            alterCount++;
            const sql = `ALTER TABLE products ADD COLUMN ${col.name} ${col.definition}`;
            console.log('添加列:', sql);
            
            connection.query(sql, (err) => {
                if (err) {
                    console.error(`添加列 ${col.name} 失败:`, err);
                } else {
                    console.log(`成功添加列 ${col.name}`);
                }
                
                completedCount++;
                if (completedCount === alterCount) {
                    console.log('所有列已添加完成');
                    connection.end();
                }
            });
        }
    });
    
    if (alterCount === 0) {
        console.log('所有需要的列都已存在');
        connection.end();
    }
});