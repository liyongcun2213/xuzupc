const mysql = require('mysql');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
};

function checkPartnersTable() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查合作伙伴表结构...\n');
    
    // 检查表是否存在
    connection.query('SHOW TABLES LIKE "partners"', (err, result) => {
        if (err) {
            console.error('检查表失败:', err);
            connection.end();
            return;
        }
        
        if (result.length === 0) {
            console.log('partners表不存在，正在创建...');
            
            // 创建partners表
            connection.query(`
                CREATE TABLE partners (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(100) NOT NULL COMMENT '合作伙伴姓名',
                    phone VARCHAR(20) COMMENT '联系电话',
                    email VARCHAR(100) COMMENT '电子邮箱',
                    commission_rate DECIMAL(5,2) DEFAULT 5.00 COMMENT '佣金比例(%)',
                    status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态',
                    notes TEXT COMMENT '备注',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('创建表失败:', err);
                } else {
                    console.log('partners表创建成功！');
                    
                    // 创建测试数据
                    createTestPartners(connection);
                }
            });
        } else {
            console.log('partners表已存在，检查结构...');
            
            // 检查表结构
            connection.query('DESCRIBE partners', (err, result) => {
                if (err) {
                    console.error('查询表结构失败:', err);
                    connection.end();
                    return;
                }
                
                console.log('表结构:');
                result.forEach(column => {
                    console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
                });
                
                connection.end();
            });
        }
    });
}

function createTestPartners(connection) {
    console.log('创建测试合作伙伴数据...');
    
    const partners = [
        {
            name: '张三',
            phone: '13800138001',
            email: 'zhangsan@example.com',
            commission_rate: 5.0,
            notes: '资深合作伙伴'
        },
        {
            name: '李四',
            phone: '13800138002',
            email: 'lisi@example.com',
            commission_rate: 3.5,
            notes: '新合作伙伴'
        },
        {
            name: '王五',
            phone: '13800138003',
            email: 'wangwu@example.com',
            commission_rate: 7.0,
            notes: '高级合作伙伴'
        }
    ];
    
    let completedCount = 0;
    const totalCount = partners.length;
    
    partners.forEach(partner => {
        connection.query(`
            INSERT INTO partners (
                name, phone, email, commission_rate, notes, status
            ) VALUES (?, ?, ?, ?, ?, 'active')
        `, [
            partner.name,
            partner.phone,
            partner.email,
            partner.commission_rate,
            partner.notes
        ], (err, result) => {
            if (err) {
                console.error('创建合作伙伴失败:', err);
            } else {
                console.log(`创建合作伙伴: ${partner.name} (佣金比例: ${partner.commission_rate}%)`);
            }
            
            completedCount++;
            if (completedCount === totalCount) {
                // 所有合作伙伴创建完成
                console.log('\n测试合作伙伴数据创建完成！');
                console.log('合作伙伴管理页面: http://localhost:3000/partners');
                console.log('新增合作伙伴页面: http://localhost:3000/partners/add');
                
                connection.end();
            }
        });
    });
}

// 运行检查
checkPartnersTable();