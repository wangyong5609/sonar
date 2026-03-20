import { createApp } from './api';

const app = createApp();
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ 抖音自动获客工具运行中`);
  console.log(`👉 打开浏览器访问: http://localhost:${PORT}`);
});
