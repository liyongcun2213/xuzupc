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

function createTestAccessories() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('创建测试配件数据...\n');
    
    // 查询配件类别
    connection.query('SELECT id, name FROM accessory_categories ORDER BY id LIMIT 9', (err, categories) => {
        if (err) {
            console.error('查询配件类别失败:', err);
            connection.end();
            return;
        }
        
        if (categories.length === 0) {
            console.log('未找到配件类别');
            connection.end();
            return;
        }
        
        console.log('找到的配件类别:');
        categories.forEach(cat => {
            console.log(`  ${cat.id}: ${cat.name}`);
        });
        
        // 为每个类别创建一个测试配件
        let completed = 0;
        categories.forEach(category => {
            const accessoryData = {
                name: `${category.name}-测试配件`,
                category_id: category.id,
                brand: '测试品牌',
                model: `${category.name}-型号001`,
                description: `这是${category.name}类别的测试配件`,
                unit_price: Math.floor(Math.random() * 1000) + 100, // 随机价格 100-1100
                stock_quantity: 50,
                min_stock_level: 5,
                status: 'active'
            };
            
            connection.query('INSERT INTO accessories SET ?', accessoryData, (err, result) => {
                if (err) {
                    console.error(`创建${category.name}配件失败:`, err);
                } else {
                    console.log(`  创建${category.name}配件成功 (ID: ${result.insertId})`);
                }
                
                completed++;
                if (completed === categories.length) {
                    connection.end();
                    console.log('\n配件创建完成！现在可以测试产品和设备模板的创建了。');
                }
            });
        });
    });
}

// 运行创建
createTestAccessories();