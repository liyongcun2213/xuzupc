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

function createTestPartners() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('创建测试合作伙伴数据...\n');
    
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

// 运行创建
createTestPartners();