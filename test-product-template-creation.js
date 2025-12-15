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

function testProductTemplateCreation() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('测试产品模板创建功能...\n');
    
    // 检查现有产品和对应的设备模板
    connection.query(`
        SELECT p.id, p.product_code, p.name, c.name as category_name
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        WHERE p.created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY p.created_at DESC
        LIMIT 5
    `, (err, products) => {
        if (err) {
            console.error('查询最近产品失败:', err);
            connection.end();
            return;
        }
        
        if (products.length === 0) {
            console.log('最近24小时内没有新创建的产品');
            connection.end();
            return;
        }
        
        console.log('最近创建的产品:');
        console.log('ID\t产品编码\t产品名称\t\t类别');
        console.log('------------------------------------------------------');
        
        products.forEach(product => {
            console.log(`${product.id}\t${product.product_code}\t${product.name}\t\t${product.category_name}`);
            
            // 检查每个产品是否有设备模板
            connection.query(`
                SELECT COUNT(*) as count, 
                       COUNT(CASE WHEN is_required = 1 THEN 1 END) as required_count
                FROM device_templates 
                WHERE product_code = ?
            `, [product.product_code], (err, templateResult) => {
                if (err) {
                    console.error(`查询产品 ${product.product_code} 的设备模板失败:`, err);
                    return;
                }
                
                const totalCount = templateResult[0].count;
                const requiredCount = templateResult[0].required_count;
                
                console.log(`  设备模板: ${totalCount} 项 (必需: ${requiredCount} 项)`);
                
                if (totalCount > 0) {
                    // 查看模板详情
                    connection.query(`
                        SELECT accessory_category_id, accessory_name, brand, model, quantity, is_required
                        FROM device_templates 
                        WHERE product_code = ?
                        ORDER BY accessory_category_id
                    `, [product.product_code], (err, templates) => {
                        if (err) {
                            console.error(`查询产品 ${product.product_code} 的设备模板详情失败:`, err);
                            return;
                        }
                        
                        console.log('  模板详情:');
                        templates.forEach(template => {
                            const required = template.is_required ? '必需' : '可选';
                            console.log(`    ${template.accessory_name} (${required}): ${template.brand} ${template.model || ''} x ${template.quantity}`);
                        });
                        
                        // 检查是否是最后一个产品
                        if (product.id === products[products.length - 1].id) {
                            connection.end();
                            console.log('\n测试完成！');
                            console.log('请尝试创建新产品，然后检查设备管理页面是否显示"该产品未维护详细配件清单"的提示。');
                        }
                    });
                } else {
                    console.log('  无设备模板 - 可能会在设备管理中显示"该产品未维护详细配件清单"');
                }
            });
        });
    });
}

// 运行测试
testProductTemplateCreation();