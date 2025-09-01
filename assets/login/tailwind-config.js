tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',
                    600: '#0284c7',
                    700: '#0369a1',
                    800: '#075985',
                    900: '#0c4a6e',
                },
                dark: {
                    800: '#1e293b',
                    900: '#0f172a'
                }
            },
            boxShadow: {
                'neumorphic': '8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff',
                'neumorphic-dark': '8px 8px 16px #0a1122, -8px -8px 16px #1a223a',
                'neumorphic-inset': 'inset 2px 2px 5px #d1d9e6, inset -2px -2px 5px #ffffff',
                'neumorphic-inset-dark': 'inset 2px 2px 5px #0a1122, inset -2px -2px 5px #1a223a'
            }
        }
    }
}