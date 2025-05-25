# Cheltenham Hackspace Environmental Monitoring Dashboard

A modern, clean, and fast web frontend for monitoring environmental sensor data in real-time.

## 🚀 Features

### Core Functionality
- **Real-time Sensor Monitoring**: Live data from environmental sensors across the region
- **Interactive Map**: Leaflet-based map showing sensor locations with color-coded air quality indicators
- **Data Visualization**: Multiple chart types for particulate matter, temperature, humidity, and air quality indices
- **Data Export**: Download sensor data as CSV files for analysis
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### Modern UI/UX
- **Clean Design**: Modern interface using Tabler CSS framework
- **Fast Performance**: Optimized loading with critical CSS inlining and resource preloading
- **Accessibility**: WCAG compliant with proper ARIA labels, keyboard navigation, and screen reader support
- **Mobile-First**: Responsive design with mobile navigation and touch-friendly controls
- **Dark Mode Ready**: CSS custom properties prepared for future dark mode implementation

### Technical Improvements
- **Modular Architecture**: Well-organized JavaScript with separation of concerns
- **Error Handling**: Comprehensive error handling with user-friendly notifications
- **Performance Optimizations**: Debounced events, efficient DOM updates, and optimized animations
- **Progressive Enhancement**: Works without JavaScript for basic functionality

## 📁 Project Structure

```
frontend/
├── index.html              # Main dashboard page
├── login.html              # Authentication page (development placeholder)
├── package.json            # Node.js dependencies
├── static/
│   ├── css/
│   │   └── styles.css      # Custom styles and enhancements
│   └── js/
│       └── app.js          # Main application JavaScript
└── functions/
    └── api/                # API endpoints (Cloudflare Functions)
```

## 🛠 Technologies Used

### Frontend Framework & Libraries
- **Tabler CSS**: Modern Bootstrap-based UI framework
- **Leaflet**: Interactive mapping library
- **ApexCharts**: Modern charting library
- **Leaflet.heat**: Heatmap plugin for Leaflet

### Performance & Optimization
- **Critical CSS**: Above-the-fold styles inlined for faster rendering
- **Resource Preloading**: Critical resources preloaded for better performance
- **Debounced Events**: Optimized event handling to prevent excessive API calls
- **Lazy Loading**: Charts and components loaded as needed

### Accessibility & Standards
- **WCAG 2.1 AA**: Web Content Accessibility Guidelines compliance
- **Semantic HTML**: Proper HTML5 semantic elements
- **ARIA Labels**: Screen reader support
- **Keyboard Navigation**: Full keyboard accessibility
- **High Contrast Support**: CSS for high contrast mode users
- **Reduced Motion**: Respects user's motion preferences

## 🎨 Design System

### Color Palette
- **Primary**: `#206bc4` (Blue)
- **Success**: `#2fb344` (Green)
- **Warning**: `#f76707` (Orange)
- **Danger**: `#d63939` (Red)
- **Info**: `#4dabf7` (Light Blue)

### Typography
- **Font Family**: System font stack for optimal performance
- **Headings**: Gradient text effects for branding
- **Body Text**: Optimized for readability

### Components
- **Cards**: Rounded corners with subtle shadows
- **Buttons**: Gradient backgrounds with hover effects
- **Forms**: Clean inputs with focus states
- **Navigation**: Smooth transitions and active states

## 📱 Responsive Breakpoints

- **Mobile**: `< 576px`
- **Tablet**: `576px - 768px`
- **Desktop**: `768px - 1200px`
- **Large Desktop**: `> 1200px`

## 🔧 Configuration

### API Endpoints
The application connects to the following API endpoints:
- **Sensors List**: `GET /api/v1/sensors`
- **Sensor Data**: `GET /api/v1/sensor/{id}?from={timestamp}`
- **Latest Data**: `GET /api/v1/sensor/{id}/latest`

### Environment Variables
No environment variables required for the frontend. All configuration is handled through the API endpoints.

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Web server (for local development)

### Local Development
1. Clone the repository
2. Navigate to the frontend directory
3. Serve the files using a local web server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```
4. Open `http://localhost:8000` in your browser

### Production Deployment
The frontend is designed to work with Cloudflare Pages or any static hosting service:
1. Upload all files to your hosting provider
2. Ensure the API endpoints are accessible
3. Configure any necessary CORS headers

## 🔍 Browser Support

### Fully Supported
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Partially Supported (with graceful degradation)
- Internet Explorer 11 (basic functionality only)
- Older mobile browsers

## 📊 Performance Metrics

### Lighthouse Scores (Target)
- **Performance**: 95+
- **Accessibility**: 100
- **Best Practices**: 95+
- **SEO**: 90+

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1

## 🔒 Security Features

- **Content Security Policy**: Implemented for XSS protection
- **HTTPS Only**: All external resources loaded over HTTPS
- **Input Validation**: Client-side validation for all user inputs
- **CORS Handling**: Proper cross-origin request handling

## 🧪 Testing

### Manual Testing Checklist
- [ ] Map loads and displays sensors correctly
- [ ] Charts update when selecting different sensors
- [ ] Data export functionality works
- [ ] Mobile navigation functions properly
- [ ] All interactive elements are keyboard accessible
- [ ] Screen reader compatibility verified

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## 🔄 Future Enhancements

### Planned Features
- **Dark Mode**: Toggle between light and dark themes
- **User Authentication**: Complete login/logout functionality
- **Real-time Updates**: WebSocket connections for live data
- **Advanced Filtering**: More granular data filtering options
- **Offline Support**: Service worker for offline functionality
- **PWA Features**: Install as a progressive web app

### Performance Improvements
- **Service Worker**: Caching strategy for offline support
- **Code Splitting**: Lazy load non-critical JavaScript
- **Image Optimization**: WebP format with fallbacks
- **Bundle Analysis**: Webpack bundle analyzer integration

## 🐛 Known Issues

### Current Limitations
- Authentication system is placeholder only
- Heatmap feature uses dummy data
- No offline functionality yet
- Limited to English language only

### Browser-Specific Issues
- Internet Explorer: Limited CSS Grid support
- Safari: Some CSS backdrop-filter effects may not work on older versions

## 📝 Changelog

### Version 2.0.0 (Current)
- Complete UI/UX redesign
- Modern JavaScript architecture
- Improved accessibility
- Mobile-first responsive design
- Performance optimizations
- Enhanced error handling

### Version 1.0.0 (Previous)
- Basic functionality
- Simple Bootstrap 4 styling
- Limited mobile support
- Inline JavaScript

## 🤝 Contributing

### Development Guidelines
1. Follow the existing code style and architecture
2. Ensure all new features are accessible
3. Test on multiple browsers and devices
4. Update documentation for any new features
5. Maintain performance standards

### Code Style
- Use modern ES6+ JavaScript features
- Follow semantic HTML practices
- Use CSS custom properties for theming
- Implement proper error handling
- Add comments for complex logic

## 📄 License

This project is part of the Cheltenham Hackspace environmental monitoring system. Please refer to the main project license for usage terms.

## 📞 Support

For technical support or questions:
- **Email**: contact@cheltenhamhackspace.org
- **Website**: https://www.cheltenhamhackspace.org/
- **GitHub**: https://github.com/cheltenham-hackspace

---

**Built with ❤️ by Cheltenham Hackspace**
