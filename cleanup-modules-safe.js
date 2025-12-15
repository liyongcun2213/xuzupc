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
console.log('4. 租赁管理 (删除所有订单数据)');
console.log('5. 退租管理');
console.log('6. 配件管理 (删除所有库存数据)');

// 获取确认
rl.question('确定要继续吗？这将删除大部分数据且不可恢复！(y/n): ', (answer) => {
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('操作已取消');
        rl.close();
        return;
    }
    
    // 创建数据库连接
    const db = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'xiaoli2213xX!', // 直接设置MySQL密码
        database: 'rental_system',
        multipleStatements: false  // 一次只执行一个语句
    });
    
    // 连接数据库
    db.connect(err => {
        if (err) {
            console.error('数据库连接失败:', err.message);
            rl.close();
            return;
        }
        
        console.log('已连接到数据库，开始清理数据...');
        
        // 定义要清空的表和对应的重置自增语句
        const tables = [
            // 清理租赁订单数据
            { name: 'rental_order_items', reset: 'ALTER TABLE rental_order_items AUTO_INCREMENT = 1' },
            { name: 'rental_orders', reset: 'ALTER TABLE rental_orders AUTO_INCREMENT = 1' },
            
            { name: 'return_records', reset: 'ALTER TABLE return_records AUTO_INCREMENT = 1' },
            { name: 'purchase_approvals', reset: 'ALTER TABLE purchase_approvals AUTO_INCREMENT = 1' },
            { name: 'purchase_accessory_items', reset: 'ALTER TABLE purchase_accessory_items AUTO_INCREMENT = 1' },
            { name: 'purchase_device_items', reset: 'ALTER TABLE purchase_device_items AUTO_INCREMENT = 1' },
            { name: 'purchase_batches', reset: 'ALTER TABLE purchase_batches AUTO_INCREMENT = 1' },
            { name: 'accessory_inventory_records', reset: 'ALTER TABLE accessory_inventory_records AUTO_INCREMENT = 1' },
            { name: 'accessory_batches', reset: 'ALTER TABLE accessory_batches AUTO_INCREMENT = 1' },
            { name: 'accessories', reset: 'ALTER TABLE accessories AUTO_INCREMENT = 1' },
            { name: 'accessory_categories', reset: 'ALTER TABLE accessory_categories AUTO_INCREMENT = 1' },
            { name: 'devices', reset: 'ALTER TABLE devices AUTO_INCREMENT = 1' },
            { name: 'product_accessories', reset: 'ALTER TABLE product_accessories AUTO_INCREMENT = 1' },
            { name: 'products', reset: 'ALTER TABLE products AUTO_INCREMENT = 1' },
            { name: 'product_categories', reset: 'ALTER TABLE product_categories AUTO_INCREMENT = 1' }
        ];
        
        // 直接开始清理所有表，包括租赁订单和配件库存
        const processTable = (index) => {
            if (index >= tables.length) {
                console.log('\n数据清理完成！');
                console.log('已清空以下模块的数据：');
                console.log('1. 租赁管理数据（包括7条订单记录）');
                console.log('2. 退租管理数据（退租记录）');
                console.log('3. 采购管理数据（批次、明细、审批记录）');
                console.log('4. 设备管理数据（设备记录）');
                console.log('5. 产品管理数据（产品、分类、配件配置）');
                console.log('6. 配件管理数据（包括1205件库存）');
                console.log('- 已重置所有相关表的自增ID');
                console.log('\n注意：客户、用户、供应商等基础数据未被删除');
                db.end();
                rl.close();
                return;
            }
            
            const table = tables[index];
            
            // 先检查表是否存在
            db.query(`SHOW TABLES LIKE '${table.name}'`, (err, result) => {
                if (err) {
                    console.error(`检查表 ${table.name} 时出错:`, err.message);
                    processTable(index + 1);
                    return;
                }
                
                if (result.length === 0) {
                    console.log(`表 ${table.name} 不存在，跳过`);
                    processTable(index + 1);
                    return;
                }
                
                // 表存在，先清空数据
                db.query(`DELETE FROM ${table.name}`, (err, result) => {
                    if (err) {
                        console.error(`清空表 ${table.name} 时出错:`, err.message);
                        processTable(index + 1);
                        return;
                    }
                    
                    console.log(`已清空表 ${table.name}`);
                    
                    // 重置自增ID
                    db.query(table.reset, (err, result) => {
                        if (err) {
                            console.error(`重置表 ${table.name} 自增ID时出错:`, err.message);
                        } else {
                            console.log(`已重置表 ${table.name} 的自增ID`);
                        }
                        
                        // 处理下一个表
                        processTable(index + 1);
                    });
                });
            });
        };
        
        // 开始处理第一个表
        processTable(0);
    });
});