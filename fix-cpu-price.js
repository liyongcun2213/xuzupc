const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

connection.connect(err => {
    if (err) {
        console.error('连接失败:', err);
        return;
    }
    console.log('已连接到MySQL服务器');
    
    // 查询所有CPU配件
    connection.query(`
        SELECT a.*, c.name as category_name 
        FROM accessories a 
        JOIN accessory_categories c ON a.category_id = c.id 
        WHERE c.name = 'CPU'
    `, (err, result) => {
        if (err) {
            console.error('查询CPU配件失败:', err);
            connection.end();
            return;
        }
        
        console.log('CPU配件列表:');
        if (result.length === 0) {
            console.log('没有找到CPU配件');
            connection.end();
            return;
        }
        
        result.forEach(cpu => {
            console.log(`ID: ${cpu.id}, 名称: ${cpu.name}, 品牌: ${cpu.brand}, 型号: ${cpu.model}, 价格: ${cpu.unit_price}`);
        });
        
        // 更新CPU价格
        const priceUpdates = [
            { id: 12, name: 'intel Core i7-8700k', price: 2399.00 },
            { id: 22, name: 'intel Core i7-12700KF', price: 3299.00 }
        ];
        
        let completed = 0;
        priceUpdates.forEach(update => {
            connection.query(
                'UPDATE accessories SET unit_price = ? WHERE id = ?',
                [update.price, update.id],
                (err, result) => {
                    if (err) {
                        console.error(`更新CPU ${update.name} 价格失败:`, err);
                    } else {
                        console.log(`更新CPU ${update.name} 价格为 ¥${update.price} 成功`);
                    }
                    
                    completed++;
                    if (completed === priceUpdates.length) {
                        // 查询更新后的CPU列表
                        connection.query(`
                            SELECT a.*, c.name as category_name 
                            FROM accessories a 
                            JOIN accessory_categories c ON a.category_id = c.id 
                            WHERE c.name = 'CPU'
                        `, (err, result) => {
                            if (err) {
                                console.error('查询更新后的CPU配件失败:', err);
                                connection.end();
                                return;
                            }
                            
                            console.log('更新后的CPU配件列表:');
                            result.forEach(cpu => {
                                console.log(`ID: ${cpu.id}, 名称: ${cpu.name}, 品牌: ${cpu.brand}, 型号: ${cpu.model}, 价格: ${cpu.unit_price}`);
                            });
                            
                            connection.end();
                        });
                    }
                }
            );
        });
    });
});