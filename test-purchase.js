const mysql = require('mysql');

// 创建数据库连接
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: false
});

console.log('=== 测试采购功能 ===');

// 连接数据库
db.connect(err => {
    if (err) {
        console.error('数据库连接失败:', err.message);
        return;
    }
    
    console.log('已连接到数据库');
    
    // 检查是否有配件和产品数据
    db.query('SELECT COUNT(*) as count FROM accessories', (err, result) => {
        if (err) {
            console.error('查询配件失败:', err.message);
            return;
        }
        
        const accessoryCount = result[0].count;
        console.log(`配件数量: ${accessoryCount}`);
        
        db.query('SELECT COUNT(*) as count FROM products', (err, result) => {
            if (err) {
                console.error('查询产品失败:', err.message);
                return;
            }
            
            const productCount = result[0].count;
            console.log(`产品数量: ${productCount}`);
            
            // 检查供应商数据
            db.query('SELECT COUNT(*) as count FROM suppliers', (err, result) => {
                if (err) {
                    console.error('查询供应商失败:', err.message);
                    return;
                }
                
                const supplierCount = result[0].count;
                console.log(`供应商数量: ${supplierCount}`);
                
                if (accessoryCount === 0 && productCount === 0) {
                    console.log('\n问题原因: 没有配件和产品数据');
                    console.log('解决方案: 需要先添加一些配件和产品数据');
                } else if (supplierCount === 0) {
                    console.log('\n问题原因: 没有供应商数据');
                    console.log('解决方案: 需要先添加供应商数据');
                } else {
                    console.log('\n基础数据检查通过');
                    
                    // 查看具体的配件和产品示例
                    if (accessoryCount > 0) {
                        db.query('SELECT id, name, unit_price FROM accessories LIMIT 3', (err, results) => {
                            if (!err && results.length > 0) {
                                console.log('\n示例配件:');
                                results.forEach(item => {
                                    console.log(`- ID: ${item.id}, 名称: ${item.name}, 价格: ${item.unit_price}`);
                                });
                            }
                        });
                    }
                    
                    if (productCount > 0) {
                        db.query('SELECT id, name, purchase_price FROM products LIMIT 3', (err, results) => {
                            if (!err && results.length > 0) {
                                console.log('\n示例产品:');
                                results.forEach(item => {
                                    console.log(`- ID: ${item.id}, 名称: ${item.name}, 价格: ${item.purchase_price}`);
                                });
                            }
                        });
                    }
                }
                
                db.end();
            });
        });
    });
});