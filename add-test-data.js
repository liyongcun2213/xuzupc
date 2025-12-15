const mysql = require('mysql');

// 创建数据库连接
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    multipleStatements: false
});

console.log('=== 添加测试数据 ===');

// 连接数据库
db.connect(err => {
    if (err) {
        console.error('数据库连接失败:', err.message);
        return;
    }
    
    console.log('已连接到数据库，开始添加测试数据...');
    
    // 开始事务
    db.beginTransaction(err => {
        if (err) {
            console.error('开始事务失败:', err.message);
            return;
        }
        
        // 添加配件分类
        db.query(`INSERT INTO accessory_categories (name, description) VALUES 
        ('CPU', '中央处理器'),
        ('内存', '内存条'),
        ('硬盘', '硬盘驱动器'),
        ('显卡', '显示卡'),
        ('主板', '主板')`, (err) => {
            if (err) {
                console.error('添加配件分类失败:', err.message);
                db.rollback();
                return;
            }
            
            console.log('已添加配件分类');
            
            // 获取刚添加的分类ID
            db.query('SELECT id, name FROM accessory_categories', (err, categories) => {
                if (err) {
                    console.error('查询配件分类失败:', err.message);
                    db.rollback();
                    return;
                }
                
                // 添加配件
                const accessories = [
                    { name: 'Intel Core i5-10400', brand: 'Intel', model: 'i5-10400', category_id: getCategoryId(categories, 'CPU'), unit_price: 1200, stock_quantity: 50, description: 'Intel 第10代 i5 处理器' },
                    { name: 'Intel Core i7-10700', brand: 'Intel', model: 'i7-10700', category_id: getCategoryId(categories, 'CPU'), unit_price: 2000, stock_quantity: 30, description: 'Intel 第10代 i7 处理器' },
                    { name: 'AMD Ryzen 5 5600X', brand: 'AMD', model: '5600X', category_id: getCategoryId(categories, 'CPU'), unit_price: 1500, stock_quantity: 25, description: 'AMD Ryzen 5 处理器' },
                    { name: 'Kingston DDR4 16GB', brand: 'Kingston', model: 'KVR16N11/8', category_id: getCategoryId(categories, '内存'), unit_price: 350, stock_quantity: 100, description: 'Kingston DDR4 16GB 内存条' },
                    { name: 'Corsair DDR4 32GB', brand: 'Corsair', model: 'CMK32GX4M2A2666C16', category_id: getCategoryId(categories, '内存'), unit_price: 700, stock_quantity: 60, description: 'Corsair DDR4 32GB 内存条' },
                    { name: 'Samsung 970 EVO 500GB', brand: 'Samsung', model: 'MZ-V7E500BW', category_id: getCategoryId(categories, '硬盘'), unit_price: 600, stock_quantity: 40, description: 'Samsung 970 EVO 500GB SSD' },
                    { name: 'Western Digital 1TB', brand: 'WD', model: 'WD10EZEX', category_id: getCategoryId(categories, '硬盘'), unit_price: 300, stock_quantity: 80, description: 'Western Digital 1TB HDD' },
                    { name: 'NVIDIA GTX 1660', brand: 'NVIDIA', model: 'GTX 1660', category_id: getCategoryId(categories, '显卡'), unit_price: 1500, stock_quantity: 20, description: 'NVIDIA GTX 1660 显卡' },
                    { name: 'ASUS RTX 3060', brand: 'ASUS', model: 'RTX 3060', category_id: getCategoryId(categories, '显卡'), unit_price: 2500, stock_quantity: 15, description: 'ASUS RTX 3060 显卡' },
                    { name: 'MSI B550M', brand: 'MSI', model: 'B550M PRO-VDH', category_id: getCategoryId(categories, '主板'), unit_price: 800, stock_quantity: 35, description: 'MSI B550M 主板' }
                ];
                
                let accessoryCount = 0;
                accessories.forEach(accessory => {
                    db.query(`INSERT INTO accessories (name, brand, model, category_id, unit_price, stock_quantity, description) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                    [accessory.name, accessory.brand, accessory.model, accessory.category_id, accessory.unit_price, accessory.stock_quantity, accessory.description], 
                    (err) => {
                        if (err) {
                            console.error(`添加配件 ${accessory.name} 失败:`, err.message);
                        } else {
                            accessoryCount++;
                            if (accessoryCount === accessories.length) {
                                console.log(`已添加 ${accessoryCount} 个配件`);
                                addProductCategories();
                            }
                        }
                    });
                });
            });
        });
    });
    
    // 添加产品分类
    function addProductCategories() {
        db.query(`INSERT INTO product_categories (name, description) VALUES 
        ('笔记本电脑', '各种品牌和配置的笔记本电脑'),
        ('台式电脑', '各种品牌和配置的台式电脑'),
        ('服务器', '服务器和工作站设备')`, (err) => {
            if (err) {
                console.error('添加产品分类失败:', err.message);
                db.rollback();
                return;
            }
            
            console.log('已添加产品分类');
            
            // 获取刚添加的分类ID
            db.query('SELECT id, name FROM product_categories', (err, categories) => {
                if (err) {
                    console.error('查询产品分类失败:', err.message);
                    db.rollback();
                    return;
                }
                
                // 添加产品
                const products = [
                    { name: '联想 ThinkPad E15', brand: 'Lenovo', model: 'E15', category_id: getCategoryId(categories, '笔记本电脑'), purchase_price: 4500, specifications: 'Intel i5/8GB/256GB SSD' },
                    { name: '戴尔 Inspiron 14', brand: 'Dell', model: 'Inspiron 14', category_id: getCategoryId(categories, '笔记本电脑'), purchase_price: 4000, specifications: 'Intel i5/8GB/512GB SSD' },
                    { name: '惠普 ProBook 450', brand: 'HP', model: 'ProBook 450', category_id: getCategoryId(categories, '笔记本电脑'), purchase_price: 4800, specifications: 'Intel i7/16GB/512GB SSD' },
                    { name: '华硕 VivoBook 15', brand: 'ASUS', model: 'VivoBook 15', category_id: getCategoryId(categories, '笔记本电脑'), purchase_price: 4200, specifications: 'AMD R5/8GB/256GB SSD' },
                    { name: '联想 ThinkCentre M720', brand: 'Lenovo', model: 'M720', category_id: getCategoryId(categories, '台式电脑'), purchase_price: 5000, specifications: 'Intel i5/8GB/256GB SSD' },
                    { name: '戴尔 OptiPlex 7090', brand: 'Dell', model: 'OptiPlex 7090', category_id: getCategoryId(categories, '台式电脑'), purchase_price: 5500, specifications: 'Intel i7/16GB/512GB SSD' },
                    { name: 'HP ProDesk 600', brand: 'HP', model: 'ProDesk 600', category_id: getCategoryId(categories, '台式电脑'), purchase_price: 4800, specifications: 'Intel i5/8GB/256GB SSD' },
                    { name: 'Dell PowerEdge T150', brand: 'Dell', model: 'PowerEdge T150', category_id: getCategoryId(categories, '服务器'), purchase_price: 12000, specifications: 'Intel Xeon/16GB/1TB HDD' }
                ];
                
                let productCount = 0;
                products.forEach(product => {
                    db.query(`INSERT INTO products (name, brand, model, category_id, purchase_price, specifications, unit_price) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                    [product.name, product.brand, product.model, product.category_id, product.purchase_price, product.specifications, product.purchase_price * 1.2], 
                    (err) => {
                        if (err) {
                            console.error(`添加产品 ${product.name} 失败:`, err.message);
                        } else {
                            productCount++;
                            if (productCount === products.length) {
                                console.log(`已添加 ${productCount} 个产品`);
                                
                                // 提交事务
                                db.commit(err => {
                                    if (err) {
                                        console.error('提交事务失败:', err.message);
                                        db.rollback();
                                    } else {
                                        console.log('\n测试数据添加成功！');
                                        console.log('现在可以正常创建采购订单了');
                                    }
                                    
                                    db.end();
                                });
                            }
                        }
                    });
                });
            });
        });
    }
});

// 辅助函数：根据分类名称获取分类ID
function getCategoryId(categories, name) {
    const category = categories.find(cat => cat.name === name);
    return category ? category.id : 1;
}