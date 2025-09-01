tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
          animation: {
            'fade-in': 'fadeIn 1.2s ease-in forwards',
          },
          keyframes: {
            fadeIn: {
              '0%': { opacity: '0', transform: 'translateY(10px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            }
          },
          fontSize: {
            'xxl': '2rem',
          }
        }
      }
    
}