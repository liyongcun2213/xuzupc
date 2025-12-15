const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'xiaoli2213xX!',
    database: 'rental_system'
});

db.connect(err => {
    if (err) {
        console.error('数据库连接失败:', err);
        process.exit(1);
    }
    
    console.log('开始补录批次库存数据...\n');
    
    // 获取所有已完成的配件采购项
    db.query(`
        SELECT 
            pb.id as batch_id,
            pb.batch_no,
            pb.supplier_id,
            pb.purchase_date,
            pai.id as batch_item_id,
            pai.accessory_id,
            pai.quantity,
            pai.unit_price,
            a.name as accessory_name,
            ac.name as category_name
        FROM purchase_batches pb
        JOIN purchase_accessory_items pai ON pb.id = pai.batch_id
        JOIN accessories a ON pai.accessory_id = a.id
        LEFT JOIN accessory_categories ac ON a.category_id = ac.id
        WHERE pb.status = 'completed'
        ORDER BY pb.created_at ASC
    `, (err, items) => {
        if (err) {
            console.error('查询采购项失败:', err);
            db.end();
            process.exit(1);
        }
        
        console.log(`找到 ${items.length} 条已完成的配件采购记录\n`);
        
        if (items.length === 0) {
            console.log('没有需要补录的数据');
            db.end();
            return;
        }
        
        let processedCount = 0;
        let successCount = 0;
        
        items.forEach(item => {
            // 生成批次唯一编号 (使用类别名或配件ID)
            const purchaseDate = item.purchase_date ? 
                new Date(item.purchase_date).toISOString().split('T')[0].replace(/-/g, '') : 
                new Date().toISOString().split('T')[0].replace(/-/g, '');
            const categoryPrefix = item.category_name ? item.category_name.substring(0, 3).toUpperCase() : 'ACC';
            const uniqueBatchId = `${categoryPrefix}${item.accessory_id}-${purchaseDate}-${item.batch_id}`;
            
            // 检查是否已存在
            db.query(`
                SELECT id FROM accessory_batch_stock 
                WHERE unique_id = ? AND accessory_id = ?
            `, [uniqueBatchId, item.accessory_id], (err, existing) => {
                if (err) {
                    console.error(`检查批次 ${uniqueBatchId} 失败:`, err.message);
                } else if (existing.length > 0) {
                    console.log(`✓ 批次 ${uniqueBatchId} 已存在，跳过`);
                } else {
                    // 插入批次库存记录
                    db.query(`
                        INSERT INTO accessory_batch_stock (
                            unique_id, accessory_id, batch_id, batch_item_id,
                            purchase_price, quantity, used_quantity
                        ) VALUES (?, ?, ?, ?, ?, ?, 0)
                    `, [
                        uniqueBatchId,
                        item.accessory_id,
                        item.batch_id,
                        item.batch_item_id,
                        item.unit_price,
                        item.quantity
                    ], (err) => {
                        if (err) {
                            console.error(`✗ 插入批次 ${uniqueBatchId} 失败:`, err.message);
                        } else {
                            successCount++;
                            console.log(`✓ 插入批次 ${uniqueBatchId} (配件ID: ${item.accessory_id}, 数量: ${item.quantity}, 单价: ${item.unit_price})`);
                        }
                    });
                }
                
                processedCount++;
                if (processedCount === items.length) {
                    setTimeout(() => {
                        console.log(`\n补录完成！成功插入 ${successCount} 条批次记录`);
                        db.end();
                    }, 500);
                }
            });
        });
    });
});
