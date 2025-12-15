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

function createTestRentalData() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('创建测试租赁数据...\n');
    
    // 首先检查产品类别
    connection.query('SELECT id, name FROM product_categories WHERE name LIKE "%电脑%" OR name LIKE "%笔记本%"', (err, categories) => {
        if (err) {
            console.error('查询产品类别失败:', err);
            connection.end();
            return;
        }
        
        let categoryId;
        if (categories.length > 0) {
            categoryId = categories[0].id;
            console.log('使用现有产品类别:', categories[0].name);
        } else {
            console.log('未找到产品类别，将创建默认类别');
            categoryId = 1; // 假设ID为1的类别存在
        }
        
        // 创建测试产品
        const products = [
            {
                name: 'MacBook Pro 14寸',
                product_code: 'MBP14-001',
                brand: 'Apple',
                model: 'MacBook Pro 14',
                specifications: 'M1 Pro芯片, 16GB内存, 512GB存储',
                purchase_price: 15000,
                rental_price_per_day: 100,
                rental_price_per_month: 2000,
                category_id: categoryId
            },
            {
                name: 'ThinkPad X1 Carbon',
                product_code: 'TPX1-001',
                brand: 'Lenovo',
                model: 'ThinkPad X1 Carbon',
                specifications: 'Intel i7处理器, 16GB内存, 1TB存储',
                purchase_price: 12000,
                rental_price_per_day: 80,
                rental_price_per_month: 1500,
                category_id: categoryId
            },
            {
                name: 'Dell XPS 15',
                product_code: 'DXPS-001',
                brand: 'Dell',
                model: 'XPS 15',
                specifications: 'Intel i9处理器, 32GB内存, 1TB存储',
                purchase_price: 18000,
                rental_price_per_day: 120,
                rental_price_per_month: 2500,
                category_id: categoryId
            }
        ];
        
        let productsCreated = 0;
        const productIds = [];
        
        // 创建产品
        products.forEach(product => {
            connection.query(`
                INSERT INTO products (
                    name, product_code, brand, model, specifications, 
                    purchase_price, rental_price_per_day, rental_price_per_month, 
                    category_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `, [
                product.name, product.product_code, product.brand, product.model,
                product.specifications, product.purchase_price,
                product.rental_price_per_day, product.rental_price_per_month,
                product.category_id
            ], (err, result) => {
                if (err) {
                    console.error('创建产品失败:', err);
                    connection.end();
                    return;
                }
                
                const productId = result.insertId;
                productIds.push(productId);
                productsCreated++;
                
                // 为每个产品创建设备实例
                connection.query(`
                    INSERT INTO devices (
                        product_id, serial_number, purchase_date, 
                        purchase_price, status, location
                    ) VALUES (?, ?, CURDATE(), ?, 'available', '仓库A')
                `, [productId, `SN${productId}001`, product.purchase_price], (err) => {
                    if (err) {
                        console.error('创建设备失败:', err);
                        connection.end();
                        return;
                    }
                    
                    console.log(`创建产品设备: ${product.product_code} - ${product.name}`);
                    
                    if (productsCreated === products.length) {
                        // 所有产品和设备创建完成
                        console.log('\n测试数据创建完成！');
                        console.log('现在可以访问租赁订单创建页面了:');
                        console.log('http://localhost:3000/rental-orders/add');
                        
                        connection.end();
                    }
                });
            });
        });
    });
}

// 运行创建
createTestRentalData();