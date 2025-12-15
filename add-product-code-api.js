const fs = require('fs');

// 读取server.js文件
fs.readFile('server.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取server.js文件失败:', err);
        return;
    }
    
    // 找到产品路由部分
    const insertMarker = "// 添加产品页面";
    const insertIndex = data.indexOf(insertMarker);
    
    if (insertIndex === -1) {
        console.error('未找到插入位置');
        return;
    }
    
    // 新的产品编号生成API
    const productCodeAPI = `
// 获取下一个产品编号API
app.get('/api/get-next-product-code', isAuthenticated, (req, res) => {
    // 查询当前最大的产品编号
    db.query('SELECT product_code FROM products WHERE product_code IS NOT NULL ORDER BY product_code DESC LIMIT 1', (err, result) => {
        if (err) {
            console.error('查询产品编号失败:', err);
            return res.status(500).json({ error: '查询产品编号失败' });
        }
        
        let nextNumber = 1;
        if (result.length > 0) {
            // 从当前最大编号提取数字部分
            const currentCode = result[0].product_code;
            const match = currentCode.match(/PC(\d+)/);
            if (match) {
                nextNumber = parseInt(match[1]) + 1;
            }
        }
        
        // 生成新编号，格式为PC0001
        const nextCode = 'PC' + String(nextNumber).padStart(4, '0');
        
        res.json({ productCode: nextCode });
    });
});

`;

    // 插入API代码
    const newContent = data.substring(0, insertIndex) + productCodeAPI + data.substring(insertIndex);
    
    // 写回文件
    fs.writeFile('server.js', newContent, 'utf8', (err) => {
        if (err) {
            console.error('写入server.js文件失败:', err);
            return;
        }
        
        console.log('产品编号API添加成功！');
    });
});