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

function checkDeviceTemplates() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查设备模板数据...\n');
    
    // 查询所有产品及其设备模板
    connection.query(`
        SELECT p.id, p.product_code, p.name, p.created_at,
               COUNT(dt.id) as template_count
        FROM products p
        LEFT JOIN device_templates dt ON p.product_code = dt.product_code
        GROUP BY p.id, p.product_code, p.name, p.created_at
        ORDER BY p.created_at DESC
        LIMIT 10
    `, (err, products) => {
        if (err) {
            console.error('查询产品和模板失败:', err);
            connection.end();
            return;
        }
        
        console.log('产品及其设备模板:');
        console.log('ID\t产品编码\t\t产品名称\t\t模板数量\t创建时间');
        console.log('------------------------------------------------------------------------------------');
        
        if (products.length === 0) {
            console.log('未找到任何产品');
            connection.end();
            return;
        }
        
        products.forEach(product => {
            const hasTemplate = product.template_count > 0 ? '✓' : '✗';
            console.log(`${product.id}\t${product.product_code}\t\t${product.name}\t\t${product.template_count}\t\t${product.created_at}\t${hasTemplate}`);
        });
        
        // 查询没有设备模板的产品
        connection.query(`
            SELECT p.id, p.product_code, p.name, p.created_at
            FROM products p
            LEFT JOIN device_templates dt ON p.product_code = dt.product_code
            WHERE dt.id IS NULL
            ORDER BY p.created_at DESC
            LIMIT 5
        `, (err, productsWithoutTemplates) => {
            if (err) {
                console.error('查询无模板产品失败:', err);
                connection.end();
                return;
            }
            
            if (productsWithoutTemplates.length > 0) {
                console.log('\n没有设备模板的产品:');
                console.log('ID\t产品编码\t\t产品名称\t\t创建时间');
                console.log('------------------------------------------------------------------------------------');
                
                productsWithoutTemplates.forEach(product => {
                    console.log(`${product.id}\t${product.product_code}\t\t${product.name}\t\t${product.created_at}`);
                });
            } else {
                console.log('\n所有产品都有设备模板！');
            }
            
            // 查询设备模板的详细信息
            connection.query(`
                SELECT dt.*, ac.name as category_name
                FROM device_templates dt
                JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
                ORDER BY dt.product_code, dt.accessory_category_id
                LIMIT 20
            `, (err, templates) => {
                if (err) {
                    console.error('查询设备模板详情失败:', err);
                    connection.end();
                    return;
                }
                
                if (templates.length > 0) {
                    console.log('\n设备模板详情:');
                    console.log('产品编码\t\t配件类别\t配件名称\t\t品牌\t\t型号\t\t数量\t必需');
                    console.log('------------------------------------------------------------------------------------');
                    
                    templates.forEach(template => {
                        const required = template.is_required ? '是' : '否';
                        console.log(`${template.product_code}\t\t${template.category_name}\t${template.accessory_name}\t\t${template.brand || ''}\t\t${template.model || ''}\t\t${template.quantity}\t${required}`);
                    });
                }
                
                connection.end();
                console.log('\n检查完成！');
            });
        });
    });
}

// 运行检查
checkDeviceTemplates();