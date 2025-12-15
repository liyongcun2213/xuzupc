const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect(err => {
    if (err) {
        console.error('连接MySQL服务器失败:', err);
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 获取配件类别ID
    connection.query('SELECT * FROM accessory_categories', (err, categories) => {
        if (err) {
            console.error('查询配件类别失败:', err);
            connection.end();
            return;
        }
        
        // 创建类别名称到ID的映射
        const categoryMap = {};
        categories.forEach(category => {
            categoryMap[category.name] = category.id;
        });
        
        // 准备示例配件数据
        const sampleAccessories = [
            // CPU
            { name: 'Intel Core i3-10100', brand: 'Intel', model: 'i3-10100', category_id: categoryMap['CPU'], unit_price: 799.00 },
            { name: 'Intel Core i5-10400', brand: 'Intel', model: 'i5-10400', category_id: categoryMap['CPU'], unit_price: 1299.00 },
            { name: 'Intel Core i7-10700', brand: 'Intel', model: 'i7-10700', category_id: categoryMap['CPU'], unit_price: 2099.00 },
            { name: 'AMD Ryzen 3 3100', brand: 'AMD', model: 'Ryzen 3 3100', category_id: categoryMap['CPU'], unit_price: 799.00 },
            { name: 'AMD Ryzen 5 3600', brand: 'AMD', model: 'Ryzen 5 3600', category_id: categoryMap['CPU'], unit_price: 1299.00 },
            
            // 散热器
            { name: '酷冷至尊Hyper 212', brand: '酷冷至尊', model: 'Hyper 212', category_id: categoryMap['散热器'], unit_price: 199.00 },
            { name: '九州风神玄冰400', brand: '九州风神', model: '玄冰400', category_id: categoryMap['散热器'], unit_price: 149.00 },
            
            // 主板
            { name: '华硕B460M-K', brand: '华硕', model: 'B460M-K', category_id: categoryMap['主板'], unit_price: 699.00 },
            { name: '技嘉B560M DS3H', brand: '技嘉', model: 'B560M DS3H', category_id: categoryMap['主板'], unit_price: 799.00 },
            
            // 内存
            { name: '金士顿8GB DDR4 2666', brand: '金士顿', model: '8GB DDR4 2666', category_id: categoryMap['内存'], unit_price: 299.00 },
            { name: '金士顿16GB DDR4 2666', brand: '金士顿', model: '16GB DDR4 2666', category_id: categoryMap['内存'], unit_price: 499.00 },
            { name: '威刚32GB DDR4 3200', brand: '威刚', model: '32GB DDR4 3200', category_id: categoryMap['内存'], unit_price: 899.00 },
            
            // 硬盘
            { name: '西部数据500GB 蓝盘', brand: '西部数据', model: 'WD500Blue', category_id: categoryMap['硬盘'], unit_price: 299.00 },
            { name: '西部数据1TB 蓝盘', brand: '西部数据', model: 'WD1TBlue', category_id: categoryMap['硬盘'], unit_price: 399.00 },
            { name: '三星500GB 970 EVO', brand: '三星', model: '970 EVO 500GB', category_id: categoryMap['硬盘'], unit_price: 599.00 },
            { name: '三星1TB 970 EVO', brand: '三星', model: '970 EVO 1TB', category_id: categoryMap['硬盘'], unit_price: 999.00 },
            
            // 显卡
            { name: '七彩虹GTX 1650 4G', brand: '七彩虹', model: 'GTX 1650 4G', category_id: categoryMap['显卡'], unit_price: 1299.00 },
            { name: '七彩虹RTX 2060 6G', brand: '七彩虹', model: 'RTX 2060 6G', category_id: categoryMap['显卡'], unit_price: 2299.00 },
            { name: '华硕RTX 3060 12G', brand: '华硕', model: 'RTX 3060 12G', category_id: categoryMap['显卡'], unit_price: 3299.00 },
            
            // 机箱
            { name: '爱国者A15', brand: '爱国者', model: 'A15', category_id: categoryMap['机箱'], unit_price: 199.00 },
            { name: '酷冷至尊MasterBox Q300L', brand: '酷冷至尊', model: 'MasterBox Q300L', category_id: categoryMap['机箱'], unit_price: 299.00 },
            
            // 电源
            { name: '航嘉WD500K', brand: '航嘉', model: 'WD500K', category_id: categoryMap['电源'], unit_price: 299.00 },
            { name: '酷冷至尊GX550', brand: '酷冷至尊', model: 'GX550', category_id: categoryMap['电源'], unit_price: 399.00 },
            
            // 显示器
            { name: 'AOC 24英寸 1080P', brand: 'AOC', model: '24G2', category_id: categoryMap['显示器'], unit_price: 899.00 },
            { name: '戴尔27英寸 2K', brand: '戴尔', model: 'U2720Q', category_id: categoryMap['显示器'], unit_price: 2299.00 },
            { name: '飞利浦32英寸 4K', brand: '飞利浦', model: '328E1', category_id: categoryMap['显示器'], unit_price: 3299.00 }
        ];
        
        // 插入配件数据
        let completed = 0;
        sampleAccessories.forEach(accessory => {
            // 设置默认库存
            accessory.stock_quantity = 50;
            
            connection.query('INSERT INTO accessories SET ?', accessory, (err, result) => {
                if (err) {
                    console.error(`插入配件 ${accessory.name} 失败:`, err);
                } else {
                    console.log(`插入配件 ${accessory.name} 成功`);
                }
                
                completed++;
                if (completed === sampleAccessories.length) {
                    console.log('所有示例配件插入完成！');
                    connection.end();
                }
            });
        });
    });
});