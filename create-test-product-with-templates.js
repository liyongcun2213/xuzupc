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

function createTestProductWithTemplates() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('创建测试产品并生成设备模板...\n');
    
    // 查询台式电脑类别ID
    connection.query('SELECT id, name FROM product_categories WHERE name LIKE "%台式电脑%"', (err, categories) => {
        if (err) {
            console.error('查询产品类别失败:', err);
            connection.end();
            return;
        }
        
        if (categories.length === 0) {
            console.log('未找到台式电脑类别');
            connection.end();
            return;
        }
        
        const categoryId = categories[0].id;
        console.log(`使用类别: ${categories[0].name} (ID: ${categoryId})`);
        
        // 生成产品编号
        const today = moment().format('YYYYMMDD');
        const randomSuffix = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        const productCode = `PC${today}${randomSuffix}`;
        
        // 创建测试产品
        const productData = {
            product_code: productCode,
            name: '测试电脑' + randomSuffix,
            category_id: categoryId,
            brand: '测试品牌',
            model: '测试型号',
            specifications: '测试配置',
            total_price: 5000.00,
            calculated_daily_rent: 50.00,
            calculated_monthly_rent: 1000.00
        };
        
        connection.query('INSERT INTO products SET ?', productData, (err, result) => {
            if (err) {
                console.error('创建产品失败:', err);
                connection.end();
                return;
            }
            
            const productId = result.insertId;
            console.log(`创建产品成功: ${productCode} (ID: ${productId})`);
            
            // 查询配件并创建产品关联
            connection.query(`
                SELECT id, name, category_id, brand, model, unit_price, purchase_price
                FROM accessories 
                WHERE status = 'active'
                ORDER BY category_id, name
                LIMIT 9
            `, (err, accessories) => {
                if (err) {
                    console.error('查询配件失败:', err);
                    connection.end();
                    return;
                }
                
                if (accessories.length === 0) {
                    console.log('未找到可用配件');
                    connection.end();
                    return;
                }
                
                // 获取所有配件类别
                const categoryIds = [...new Set(accessories.map(a => a.category_id))];
                
                // 创建基本设备模板结构
                console.log('\n创建基本设备模板结构...');
                
                let completed = 0;
                categoryIds.forEach(categoryId => {
                            connection.query(`
                                INSERT INTO device_templates (
                                    product_id, product_code, product_name, accessory_category_id, 
                                    accessory_name, brand, model, quantity, is_required, notes
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                            `, [
                        productId,
                        productCode,
                        productData.name,
                        categoryId,
                        '测试配件',
                        '测试品牌',
                        '测试型号',
                        0,
                        0,
                        `基本模板 - 类别${categoryId} - 请配置具体配件`
                    ], (err) => {
                        if (err) {
                            console.error(`创建设备模板项失败:`, err);
                        } else {
                            console.log(`  创建类别${categoryId}的设备模板成功`);
                        }
                        
                        completed++;
                        if (completed === categoryIds.length) {
                            // 检查创建的模板
                            connection.query(`
                                SELECT dt.*, ac.name as category_name
                                FROM device_templates dt
                                JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                                WHERE dt.product_code = ?
                                ORDER BY dt.accessory_category_id
                            `, [productCode], (err, templates) => {
                                if (err) {
                                    console.error('查询设备模板失败:', err);
                                } else {
                                    console.log('\n创建的设备模板:');
                                    templates.forEach(template => {
                                        const required = template.is_required ? '必需' : '可选';
                                        console.log(`  ${template.accessory_name} (${required}): ${template.brand} ${template.model || ''} x ${template.quantity}`);
                                    });
                                }
                                
                                connection.end();
                                console.log('\n测试完成！');
                                console.log(`现在您可以在设备管理中测试产品 ${productCode}`);
                                console.log('它不应该再显示"该产品未维护详细配件清单"的提示');
                            });
                        }
                    });
                });
            });
        });
    });
}

// 运行测试
createTestProductWithTemplates();