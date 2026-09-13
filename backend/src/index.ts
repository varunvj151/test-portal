import app from './app';

const PORT = parseInt(process.env.PORT || '4000', 10);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
