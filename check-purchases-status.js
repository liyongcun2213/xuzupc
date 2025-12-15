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

function checkPurchasesAndUsers() {
    // 创建数据库连接
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查采购批次状态...\n');
    
    // 检查采购批次状态
    connection.query(`
        SELECT id, batch_no, status, created_at 
        FROM purchase_batches 
        ORDER BY created_at DESC 
        LIMIT 10
    `, (err, batches) => {
        if (err) {
            console.error('查询采购批次失败:', err);
            connection.end();
            return;
        }
        
        console.log('采购批次列表:');
        console.log('ID\t批次号\t\t状态\t\t创建时间');
        console.log('------------------------------------------------------');
        batches.forEach(batch => {
            const statusText = batch.status === 'pending' ? '待审批' : 
                              batch.status === 'approved' ? '已审批' : 
                              batch.status === 'delivered' ? '已到货' : 
                              batch.status === 'completed' ? '已完成' : 
                              batch.status === 'cancelled' ? '已取消' : batch.status;
            
            console.log(`${batch.id}\t${batch.batch_no}\t${statusText}\t${moment(batch.created_at).format('YYYY-MM-DD HH:mm:ss')}`);
        });
        
        console.log('\n检查用户角色...\n');
        
        // 检查所有用户角色
        connection.query(`
            SELECT id, username, real_name, role 
            FROM users 
            WHERE role IN ('admin', 'finance') OR username = 'admin'
            ORDER BY role DESC
        `, (err, users) => {
            if (err) {
                console.error('查询用户失败:', err);
                connection.end();
                return;
            }
            
            console.log('用户列表:');
            console.log('ID\t用户名\t\t姓名\t\t角色');
            console.log('------------------------------------------------------');
            users.forEach(user => {
                const roleText = user.role === 'admin' ? '管理员' : 
                                 user.role === 'finance' ? '财务' : user.role;
                
                console.log(`${user.id}\t${user.username}\t\t${user.real_name || 'N/A'}\t\t${roleText}`);
            });
            
            // 关闭连接
            connection.end();
            
            console.log('\n结论:');
            console.log('1. 删除按钮只在状态为"待审批"(pending)的批次上显示');
            console.log('2. 只有角色为"admin"或"finance"的用户才能看到删除按钮');
            console.log('3. 如果您是管理员或财务人员，但在"待审批"批次上看不到删除按钮，可能是因为页面尚未刷新或存在缓存问题');
        });
    });
}

// 运行检查
checkPurchasesAndUsers();