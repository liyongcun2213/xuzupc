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
    
    // 检查accessory_categories表是否存在
    connection.query('SHOW TABLES LIKE "accessory_categories"', (err, result) => {
        if (err) {
            console.error('查询accessory_categories表失败:', err);
            connection.end();
            return;
        }
        
        if (result.length === 0) {
            console.log('accessory_categories表不存在，正在创建...');
            connection.query(`
                CREATE TABLE IF NOT EXISTS accessory_categories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `, (err) => {
                if (err) {
                    console.error('创建accessory_categories表失败:', err);
                    connection.end();
                    return;
                }
                console.log('accessory_categories表创建成功');
                checkAccessoriesTable();
            });
        } else {
            console.log('accessory_categories表已存在');
            checkAccessoriesTable();
        }
    });
});

function checkAccessoriesTable() {
    // 检查accessories表是否存在
    connection.query('SHOW TABLES LIKE "accessories"', (err, result) => {
        if (err) {
            console.error('查询accessories表失败:', err);
            connection.end();
            return;
        }
        
        if (result.length === 0) {
            console.log('accessories表不存在，正在创建...');
            connection.query(`
                CREATE TABLE IF NOT EXISTS accessories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    category_id INT,
                    name VARCHAR(100) NOT NULL,
                    brand VARCHAR(100),
                    model VARCHAR(100),
                    specifications TEXT,
                    unit_price DECIMAL(10,2),
                    rental_price_per_day DECIMAL(10,2),
                    rental_price_per_month DECIMAL(10,2),
                    purchase_price DECIMAL(10,2),
                    status ENUM('active', 'inactive') DEFAULT 'active',
                    stock_count INT DEFAULT 0,
                    serial_number VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (category_id) REFERENCES accessory_categories(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `, (err) => {
                if (err) {
                    console.error('创建accessories表失败:', err);
                    connection.end();
                    return;
                }
                console.log('accessories表创建成功');
                checkCategories();
            });
        } else {
            console.log('accessories表已存在');
            checkCategories();
        }
    });
}

function checkCategories() {
    // 检查是否有CPU类别
    connection.query('SELECT * FROM accessory_categories WHERE name = "CPU"', (err, result) => {
        if (err) {
            console.error('查询CPU类别失败:', err);
            connection.end();
            return;
        }
        
        if (result.length === 0) {
            console.log('CPU类别不存在，正在创建...');
            connection.query(`
                INSERT INTO accessory_categories (name, description) 
                VALUES ('CPU', '中央处理器')
            `, (err) => {
                if (err) {
                    console.error('创建CPU类别失败:', err);
                    connection.end();
                    return;
                }
                console.log('CPU类别创建成功');
                checkCPUs();
            });
        } else {
            console.log('CPU类别已存在');
            checkCPUs();
        }
    });
}

function checkCPUs() {
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
            console.log('正在添加示例CPU...');
            
            // 获取CPU类别ID
            connection.query('SELECT id FROM accessory_categories WHERE name = "CPU"', (err, cpuCategory) => {
                if (err) {
                    console.error('获取CPU类别ID失败:', err);
                    connection.end();
                    return;
                }
                
                if (cpuCategory.length > 0) {
                    const categoryId = cpuCategory[0].id;
                    
                    // 插入示例CPU数据
                    const sampleCPUs = [
                        {
                            name: 'Intel Core i3-10100',
                            brand: 'Intel',
                            model: 'i3-10100',
                            unit_price: 799.00,
                            category_id: categoryId
                        },
                        {
                            name: 'Intel Core i5-10400',
                            brand: 'Intel',
                            model: 'i5-10400',
                            unit_price: 1299.00,
                            category_id: categoryId
                        },
                        {
                            name: 'Intel Core i7-10700',
                            brand: 'Intel',
                            model: 'i7-10700',
                            unit_price: 2099.00,
                            category_id: categoryId
                        },
                        {
                            name: 'AMD Ryzen 3 3100',
                            brand: 'AMD',
                            model: 'Ryzen 3 3100',
                            unit_price: 799.00,
                            category_id: categoryId
                        },
                        {
                            name: 'AMD Ryzen 5 3600',
                            brand: 'AMD',
                            model: 'Ryzen 5 3600',
                            unit_price: 1299.00,
                            category_id: categoryId
                        }
                    ];
                    
                    let completed = 0;
                    sampleCPUs.forEach(cpu => {
                        connection.query('INSERT INTO accessories SET ?', cpu, (err) => {
                            if (err) {
                                console.error(`插入CPU ${cpu.name} 失败:`, err);
                            } else {
                                console.log(`插入CPU ${cpu.name} 成功`);
                            }
                            
                            completed++;
                            if (completed === sampleCPUs.length) {
                                checkCPUsAgain();
                            }
                        });
                    });
                }
            });
        } else {
            result.forEach(cpu => {
                console.log(`ID: ${cpu.id}, 名称: ${cpu.name}, 品牌: ${cpu.brand}, 型号: ${cpu.model}, 价格: ${cpu.unit_price}`);
            });
        }
        
        connection.end();
    });
}

function checkCPUsAgain() {
    connection.query(`
        SELECT a.*, c.name as category_name 
        FROM accessories a 
        JOIN accessory_categories c ON a.category_id = c.id 
        WHERE c.name = 'CPU'
    `, (err, result) => {
        if (err) {
            console.error('再次查询CPU配件失败:', err);
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