const mysql = require('mysql');

// 连接数据库
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system',
    charset: 'utf8mb4'
});

db.connect(err => {
    if (err) {
        console.error('连接数据库失败:', err);
        return;
    }
    
    console.log('已连接到数据库');
    
    // 查找所有重复的记录
    db.query(`
        SELECT product_code, accessory_category_id, COUNT(*) as count 
        FROM device_templates 
        GROUP BY product_code, accessory_category_id 
        HAVING count > 1
    `, (err, duplicateRecords) => {
        if (err) {
            console.error('查询重复记录失败:', err);
            return db.end();
        }
        
        console.log('找到重复记录数量:', duplicateRecords.length);
        
        if (duplicateRecords.length === 0) {
            console.log('没有找到重复记录');
            return db.end();
        }
        
        // 处理每个产品类别的重复记录
        let completed = 0;
        const total = duplicateRecords.length;
        
        duplicateRecords.forEach(record => {
            const { product_code, accessory_category_id } = record;
            
            // 获取该产品类别的所有记录，按ID排序
            db.query(`
                SELECT * FROM device_templates 
                WHERE product_code = ? AND accessory_category_id = ?
                ORDER BY id
            `, [product_code, accessory_category_id], (err, records) => {
                if (err) {
                    console.error(`查询 ${product_code} 的 ${accessory_category_id} 类别记录失败:`, err);
                    return;
                }
                
                if (records.length <= 1) {
                    completed++;
                    if (completed === total) {
                        console.log('所有重复记录处理完毕');
                        db.end();
                    }
                    return;
                }
                
                // 保留第一条记录，删除其余的
                const toKeep = records[0].id;
                const toDelete = records.slice(1).map(r => r.id);
                
                console.log(`产品 ${product_code} 类别 ${accessory_category_id}: 保留记录 ${toKeep}, 删除记录 ${toDelete.join(', ')}`);
                
                // 删除多余的记录
                const deleteSql = `DELETE FROM device_templates WHERE id IN (${toDelete.join(',')})`;
                db.query(deleteSql, (err, result) => {
                    if (err) {
                        console.error(`删除记录失败:`, err);
                    } else {
                        console.log(`成功删除 ${result.affectedRows} 条重复记录`);
                    }
                    
                    completed++;
                    if (completed === total) {
                        console.log('所有重复记录处理完毕');
                        db.end();
                    }
                });
            });
        });
    });
});