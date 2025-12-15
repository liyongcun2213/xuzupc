const mysql = require('mysql');

// 数据库连接配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
};

function fixRentalTables() {
    const connection = mysql.createConnection(dbConfig);
    
    console.log('检查并修复租赁表结构...\n');
    
    // 检查rental_orders表结构
    connection.query('DESCRIBE rental_orders', (err, result) => {
        if (err) {
            console.error('查询rental_orders表结构失败:', err);
            connection.end();
            return;
        }
        
        console.log('当前rental_orders表结构:');
        result.forEach(column => {
            console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
        });
        
        // 检查是否有partner_id字段
        const hasPartnerId = result.some(col => col.Field === 'partner_id');
        const hasPaymentCycle = result.some(col => col.Field === 'payment_cycle');
        const hasRenewalCount = result.some(col => col.Field === 'renewal_count');
        
        let sqlCommands = [];
        
        if (!hasPartnerId) {
            sqlCommands.push('ALTER TABLE rental_orders ADD COLUMN partner_id INT COMMENT "合作伙伴ID"');
        }
        
        if (!hasPaymentCycle) {
            sqlCommands.push('ALTER TABLE rental_orders ADD COLUMN payment_cycle ENUM("monthly", "quarterly", "yearly") DEFAULT "quarterly" COMMENT "付款周期"');
        }
        
        if (!hasRenewalCount) {
            sqlCommands.push('ALTER TABLE rental_orders ADD COLUMN renewal_count INT DEFAULT 0 COMMENT "续租次数"');
        }
        
        if (sqlCommands.length > 0) {
            console.log('\n执行表结构更新...');
            
            // 逐条执行SQL命令
            let completedCommands = 0;
            
            sqlCommands.forEach((sql, index) => {
                console.log(`执行命令: ${sql}`);
                
                connection.query(sql, (err, result) => {
                    if (err) {
                        console.error(`执行命令失败 (${index + 1}/${sqlCommands.length}):`, err);
                    } else {
                        console.log(`命令执行成功 (${index + 1}/${sqlCommands.length})`);
                    }
                    
                    completedCommands++;
                    if (completedCommands === sqlCommands.length) {
                        console.log('\n所有命令执行完成，检查更新后的表结构...');
                        
                        // 再次检查表结构
                        connection.query('DESCRIBE rental_orders', (err, result) => {
                            if (err) {
                                console.error('查询更新后表结构失败:', err);
                                connection.end();
                                return;
                            }
                            
                            console.log('\n更新后rental_orders表结构:');
                            result.forEach(column => {
                                console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}`);
                            });
                            
                            // 检查是否有外键约束
                            connection.query(`
                                SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                                FROM information_schema.KEY_COLUMN_USAGE
                                WHERE TABLE_SCHEMA = 'rental_system' 
                                AND TABLE_NAME = 'rental_orders'
                                AND REFERENCED_TABLE_NAME IS NOT NULL
                            `, (err, constraints) => {
                                if (err) {
                                    console.error('查询外键约束失败:', err);
                                } else {
                                    console.log('\n当前外键约束:');
                                    constraints.forEach(constraint => {
                                        console.log(`${constraint.CONSTRAINT_NAME}: ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME} -> ${constraint.REFERENCED_TABLE_NAME}.${constraint.REFERENCED_COLUMN_NAME}`);
                                    });
                                    
                                    // 添加外键约束（如果不存在）
                                    const hasPartnerForeignKey = constraints.some(c => c.COLUMN_NAME === 'partner_id');
                                    
                                    if (!hasPartnerForeignKey) {
                                        console.log('\n添加partner_id外键约束...');
                                        connection.query('ALTER TABLE rental_orders ADD FOREIGN KEY (partner_id) REFERENCES partners(id)', (err) => {
                                            if (err) {
                                                console.error('添加外键约束失败:', err);
                                            } else {
                                                console.log('partner_id外键约束添加成功');
                                            }
                                            connection.end();
                                        });
                                    } else {
                                        console.log('\npartner_id外键约束已存在');
                                        connection.end();
                                    }
                                }
                            });
                        });
                    }
                });
            });
        } else {
            console.log('\nrental_orders表结构已是最新');
            connection.end();
        }
    });
}

// 执行修复
fixRentalTables();