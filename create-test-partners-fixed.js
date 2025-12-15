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
            name: '科技有限公司A',
            contact_person: '张三',
            phone: '13800138001',
            email: 'zhangsan@example.com',
            address: '北京市朝阳区科技路1号',
            commission_rate: 5.0,
            business_license: 'BL123456789',
            bank_account: '6222021234567890123'
        },
        {
            name: '信息技术公司B',
            contact_person: '李四',
            phone: '13800138002',
            email: 'lisi@example.com',
            address: '上海市浦东新区科技大道2号',
            commission_rate: 3.5,
            business_license: 'BL987654321',
            bank_account: '6222021234567890456'
        },
        {
            name: '数码科技公司C',
            contact_person: '王五',
            phone: '13800138003',
            email: 'wangwu@example.com',
            address: '深圳市南山区科技园3号',
            commission_rate: 7.0,
            business_license: 'BL456789123',
            bank_account: '6222021234567890789'
        }
    ];
    
    let completedCount = 0;
    const totalCount = partners.length;
    
    partners.forEach(partner => {
        connection.query(`
            INSERT INTO partners (
                name, contact_person, phone, email, address, commission_rate, 
                business_license, bank_account, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
            partner.name,
            partner.contact_person,
            partner.phone,
            partner.email,
            partner.address,
            partner.commission_rate,
            partner.business_license,
            partner.bank_account
        ], (err, result) => {
            if (err) {
                console.error('创建合作伙伴失败:', err);
            } else {
                console.log(`创建合作伙伴: ${partner.name} (联系人: ${partner.contact_person}, 佣金比例: ${partner.commission_rate}%)`);
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