const fs = require('fs');

// 读取server.js文件
fs.readFile('server.js', 'utf8', (err, data) => {
    if (err) {
        console.error('读取server.js文件失败:', err);
        return;
    }
    
    // 找到产品列表路由
    const startMarker = "// 产品管理页面";
    const endMarker = "// 添加产品页面";
    
    const startIndex = data.indexOf(startMarker);
    const endIndex = data.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
        console.error('未找到产品列表路由');
        return;
    }
    
    // 新的产品列表路由
    const newProductListRoute = `
// 产品管理页面
app.get('/products', isAuthenticated, (req, res) => {
    // 获取所有产品
    db.query(\`
        SELECT p.*, c.name as category_name 
        FROM products p 
        LEFT JOIN product_categories c ON p.category_id = c.id 
        ORDER BY p.created_at DESC
    \`, (err, products) => {
        if (err) {
            console.error(err);
            return res.status(500).send('服务器错误');
        }
        
        // 获取产品类别
        db.query('SELECT * FROM product_categories ORDER BY name', (err, categories) => {
            if (err) {
                console.error(err);
                return res.status(500).send('服务器错误');
            }
            
            res.render('products/index-new', { 
                products: products,
                categories: categories,
                user: req.session.user,
                active: 'products',
                pageTitle: '产品型号管理'
            });
        });
    });
});

`;

    // 替换路由代码
    const newContent = data.substring(0, startIndex) + newProductListRoute + data.substring(endIndex);
    
    // 写回文件
    fs.writeFile('server.js', newContent, 'utf8', (err) => {
        if (err) {
            console.error('写入server.js文件失败:', err);
            return;
        }
        
        console.log('产品列表路由更新成功！');
    });
});