const mysql = require('mysql');

// 创建数据库连接
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system'
});

connection.connect(err => {
  if (err) {
    console.error('连接数据库失败:', err);
    process.exit(1);
  }
  console.log('已连接到数据库');
  
  // 模拟产品配置API的查询
  const productCode = 'PC0003';
  connection.query(`
    SELECT 
      dt.accessory_category_id,
      ac.name AS category_name,
      dt.accessory_name,
      dt.brand AS template_brand,
      dt.model AS template_model,
      dt.quantity,
      a.id AS accessory_id,
      a.name AS name,
      a.brand,
      a.model,
      a.unit_price,
      a.stock_quantity
    FROM device_templates dt
    LEFT JOIN accessory_categories ac ON dt.accessory_category_id = ac.id
    LEFT JOIN accessories a ON 
      a.category_id = dt.accessory_category_id AND
      a.brand = dt.brand AND
      a.model = dt.model
    WHERE dt.product_code = ?
    ORDER BY dt.accessory_category_id
  `, [productCode], (err, rows) => {
    if (err) {
      console.error('查询产品配置错误:', err);
      connection.end();
      return;
    }
    
    console.log('=== 产品配置查询结果 ===');
    console.log(`总记录数: ${rows.length}`);
    
    let totalPrice = 0;
    const accessories = rows.map(row => {
      const unitPrice = row.unit_price ? parseFloat(row.unit_price) : 0;
      const quantity = row.quantity || 1;
      if (unitPrice > 0) {
        totalPrice += unitPrice * quantity;
      }

      return {
        accessory_id: row.accessory_id,
        category_name: row.category_name || row.accessory_name || '',
        name: row.name || row.accessory_name || '',
        brand: row.brand || row.template_brand || '',
        model: row.model || row.template_model || '',
        unit_price: unitPrice,
        stock_quantity: row.stock_quantity || 0,
        quantity: quantity
      };
    });

    console.log('配件列表:');
    accessories.forEach(acc => {
      console.log(`- ${acc.category_name}: ${acc.brand} ${acc.model} (库存: ${acc.stock_quantity}, 单价: ¥${acc.unit_price})`);
    });
    console.log(`\n总价格: ¥${totalPrice}`);
    
    connection.end();
  });
});