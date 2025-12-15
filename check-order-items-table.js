const mysql = require('mysql');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
};

function checkOrderItemsTable() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查rental_order_items表结构...\n');
    
    // 检查rental_order_items表结构
    connection.query('DESCRIBE rental_order_items', (err, result) => {
        if (err) {
            console.error('查询rental_order_items表结构失败:', err);
            connection.end();
            return;
        }
        
        console.log('当前rental_order_items表结构:');
        result.forEach(column => {
            console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
        });
        
        // 检查是否有需要的字段
        const hasDeviceCode = result.some(col => col.Field === 'device_code');
        const hasSpecifications = result.some(col => col.Field === 'specifications');
        const hasQuantity = result.some(col => col.Field === 'quantity');
        
        let sqlCommands = [];
        
        if (!hasDeviceCode) {
            sqlCommands.push('ALTER TABLE rental_order_items ADD COLUMN device_code VARCHAR(50) COMMENT "设备编号"');
        }
        
        if (!hasSpecifications) {
            sqlCommands.push('ALTER TABLE rental_order_items ADD COLUMN specifications VARCHAR(200) COMMENT "规格型号"');
        }
        
        if (!hasQuantity) {
            sqlCommands.push('ALTER TABLE rental_order_items ADD COLUMN quantity INT DEFAULT 1 COMMENT "数量"');
        }
        
        if (sqlCommands.length > 0) {
            console.log('\n执行表结构更新...');
            
            // 逐条执行SQL命令
            let completedCommands = 0;
            
            sqlCommands.forEach((sql, index) => {
                console.log(`执行命令: ${sql}`);
                
                connection.query(sql, (err, result) => {
                    if (err) {
                        console.error(`执行命令失败 (${index + 1}/${sqlCommands.length}):`, err);
                    } else {
                        console.log(`命令执行成功 (${index + 1}/${sqlCommands.length})`);
                    }
                    
                    completedCommands++;
                    if (completedCommands === sqlCommands.length) {
                        console.log('\n所有命令执行完成，检查更新后的表结构...');
                        
                        // 再次检查表结构
                        connection.query('DESCRIBE rental_order_items', (err, result) => {
                            if (err) {
                                console.error('查询更新后表结构失败:', err);
                                connection.end();
                                return;
                            }
                            
                            console.log('\n更新后rental_order_items表结构:');
                            result.forEach(column => {
                                console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
                            });
                            
                            connection.end();
                            console.log('\n表结构更新完成！');
                        });
                    }
                });
            });
        } else {
            console.log('\nrental_order_items表结构已是最新');
            connection.end();
        }
    });
}

// 执行检查
checkOrderItemsTable();