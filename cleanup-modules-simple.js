const mysql = require('mysql');
const readline = require('readline');

// 创建命令行接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('=== 模块数据清理工具 ===');
console.log('此工具将清空以下模块的数据：');
console.log('1. 设备管理');
console.log('2. 产品管理');
console.log('3. 采购管理');
console.log('4. 租赁管理');
console.log('5. 退租管理');

// 获取密码
rl.question('请输入MySQL密码: ', (password) => {
    // 获取确认
    rl.question('确定要继续吗？这将删除所有相关数据且不可恢复！(y/n): ', (answer) => {
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('操作已取消');
            rl.close();
            return;
        }
        
        // 创建数据库连接
        const db = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: password,
            database: 'rental_system',
            multipleStatements: true
        });
        
        // 连接数据库
        db.connect(err => {
            if (err) {
                console.error('数据库连接失败:', err.message);
                rl.close();
                return;
            }
            
            console.log('已连接到数据库');
            
            // 开始事务
            db.beginTransaction(err => {
                if (err) {
                    console.error('事务启动失败:', err);
                    rl.close();
                    return;
                }
                
                // 清空相关表的SQL语句（按依赖关系排序）
                const cleanUpSQL = `
                    -- 清空租赁管理相关表
                    DELETE FROM rental_order_items;
                    DELETE FROM rental_orders;
                    
                    -- 清空退租管理相关表
                    DELETE FROM return_records;
                    
                    -- 清空采购管理相关表
                    DELETE FROM purchase_approvals;
                    DELETE FROM purchase_accessory_items;
                    DELETE FROM purchase_device_items;
                    DELETE FROM purchase_batches;
                    
                    -- 清空配件相关表（如果产品被清空，配件也需要清空）
                    DELETE FROM accessory_inventory_records;
                    DELETE FROM accessory_batches;
                    DELETE FROM accessories;
                    DELETE FROM accessory_categories;
                    
                    -- 清空设备相关表
                    DELETE FROM devices;
                    
                    -- 清空产品相关表
                    DELETE FROM product_accessories;
                    DELETE FROM product_categories;
                    DELETE FROM products;
                    
                    -- 重置自增ID
                    ALTER TABLE rental_order_items AUTO_INCREMENT = 1;
                    ALTER TABLE rental_orders AUTO_INCREMENT = 1;
                    ALTER TABLE return_records AUTO_INCREMENT = 1;
                    ALTER TABLE purchase_approvals AUTO_INCREMENT = 1;
                    ALTER TABLE purchase_accessory_items AUTO_INCREMENT = 1;
                    ALTER TABLE purchase_device_items AUTO_INCREMENT = 1;
                    ALTER TABLE purchase_batches AUTO_INCREMENT = 1;
                    ALTER TABLE accessories AUTO_INCREMENT = 1;
                    ALTER TABLE accessory_batches AUTO_INCREMENT = 1;
                    ALTER TABLE accessory_inventory_records AUTO_INCREMENT = 1;
                    ALTER TABLE accessory_categories AUTO_INCREMENT = 1;
                    ALTER TABLE devices AUTO_INCREMENT = 1;
                    ALTER TABLE products AUTO_INCREMENT = 1;
                    ALTER TABLE product_accessories AUTO_INCREMENT = 1;
                    ALTER TABLE product_categories AUTO_INCREMENT = 1;
                `;
                
                // 执行清理
                db.query(cleanUpSQL, (err, results) => {
                    if (err) {
                        console.error('数据清理失败:', err);
                        db.rollback(() => {
                            console.log('事务已回滚');
                            db.end();
                            rl.close();
                        });
                        return;
                    }
                    
                    // 提交事务
                    db.commit(err => {
                        if (err) {
                            console.error('事务提交失败:', err);
                            db.rollback(() => {
                                console.log('事务已回滚');
                            });
                        } else {
                            console.log('\n数据清理完成！');
                            console.log('已清空以下模块的数据：');
                            console.log('1. 租赁管理数据（订单、明细）');
                            console.log('2. 退租管理数据（退租记录）');
                            console.log('3. 采购管理数据（批次、明细、审批记录）');
                            console.log('4. 设备管理数据（设备记录）');
                            console.log('5. 产品管理数据（产品、分类、配件配置）');
                            console.log('6. 配件管理数据（配件、批次、库存记录）');
                            console.log('- 已重置所有相关表的自增ID');
                            console.log('\n注意：客户、用户、供应商等基础数据未被删除');
                        }
                        
                        // 关闭连接
                        db.end();
                        rl.close();
                    });
                });
            });
        });
    });
});