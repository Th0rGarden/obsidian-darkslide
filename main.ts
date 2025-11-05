import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface BrightnessSettings {
	brightnessLevel: number; // -200 to 100, where 0 is no change (legacy)
	perThemeBrightness: Record<string, number>; // Per-theme brightness settings
	contrastLevel: number; // 0 to 200, where 100 is no change
	perThemeContrast: Record<string, number>; // Per-theme contrast settings
	showStatusBar: boolean; // Toggle status bar visibility
}

const DEFAULT_SETTINGS: BrightnessSettings = {
	brightnessLevel: 0,
	perThemeBrightness: {},
	contrastLevel: 100,
	perThemeContrast: {},
	showStatusBar: true
}

export default class DarkSlidePlugin extends Plugin {
	settings: BrightnessSettings;
	statusBarItem: HTMLElement;
	currentTheme: string = '';
	sliderMode: 'brightness' | 'contrast' = 'brightness';

	async onload() {
		await this.loadSettings();

		// Get current theme
		this.currentTheme = this.getCurrentTheme();

		// Apply initial brightness and contrast for current theme
		this.applyBrightness();
		this.applyContrast();

		// Add status bar slider if enabled
		if (this.settings.showStatusBar) {
			this.createStatusBarSlider();
		}

		// Watch for theme changes
		this.setupThemeWatcher();

		// Add settings tab
		this.addSettingTab(new BrightnessSettingTab(this.app, this));

		// Add ribbon icon for quick access
		this.addRibbonIcon('sun', 'Adjust background brightness', () => {
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById('darkslide');
		});
	}

	onunload() {
		// Reset CSS variables on unload
		document.body.style.removeProperty('--darkslide-overlay');
		document.body.style.removeProperty('filter');
		// Remove status bar if it exists
		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}
	}

	toggleStatusBar(show: boolean) {
		if (show && !this.statusBarItem) {
			this.createStatusBarSlider();
		} else if (!show && this.statusBarItem) {
			this.statusBarItem.remove();
			this.statusBarItem = null as any;
		}
	}

	createStatusBarSlider() {
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('brightness-status-bar');
		
		// Create container with icon and slider
		const container = this.statusBarItem.createEl('div', {
			cls: 'brightness-slider-container'
		});
		
		// Add mode icon (changes based on mode)
		const modeIcon = container.createEl('span', {
			text: '☀️',
			cls: 'brightness-icon'
		});
		
		// Create slider
		const slider = container.createEl('input', {
			type: 'range',
			cls: 'brightness-slider'
		});
		slider.min = '-200';
		slider.max = '100';
		slider.step = '5';
		slider.value = this.getBrightnessForTheme(this.currentTheme).toString();
		
		// Add value display
		const valueDisplay = container.createEl('span', {
			text: `${this.getBrightnessForTheme(this.currentTheme)}`,
			cls: 'brightness-value'
		});
		
		// Add reset button
		const resetBtn = container.createEl('button', {
			text: '↺',
			cls: 'brightness-reset-btn'
		});
		resetBtn.title = 'Reset to default';
		
		// Add toggle button to switch between brightness and contrast
		const toggleBtn = container.createEl('button', {
			text: '◐',
			cls: 'brightness-toggle-btn'
		});
		toggleBtn.title = 'Switch to contrast control';
		
		// Handle slider change
		slider.addEventListener('input', (e) => {
			const value = parseInt((e.target as HTMLInputElement).value);
			if (this.sliderMode === 'brightness') {
				this.setBrightnessForTheme(this.currentTheme, value);
				valueDisplay.setText(`${value}`);
				this.applyBrightness();
			} else {
				this.setContrastForTheme(this.currentTheme, value);
				valueDisplay.setText(`${value}%`);
				this.applyContrast();
			}
		});
		
		// Save on mouse up
		slider.addEventListener('mouseup', () => {
			void this.saveSettings();
		});
		
		// Also save on touch end for mobile
		slider.addEventListener('touchend', () => {
			void this.saveSettings();
		});
		
		// Reset button handler
		resetBtn.addEventListener('click', () => {
			if (this.sliderMode === 'brightness') {
				this.setBrightnessForTheme(this.currentTheme, 0);
				slider.value = '0';
				valueDisplay.setText('0');
				this.applyBrightness();
			} else {
				this.setContrastForTheme(this.currentTheme, 100);
				slider.value = '100';
				valueDisplay.setText('100%');
				this.applyContrast();
			}
			void this.saveSettings();
		});
		
		// Toggle button handler
		toggleBtn.addEventListener('click', () => {
			if (this.sliderMode === 'brightness') {
				// Switch to contrast mode
				this.sliderMode = 'contrast';
				modeIcon.setText('◐');
				toggleBtn.setText('☀️');
				toggleBtn.title = 'Switch to brightness control';
				resetBtn.title = 'Reset contrast to 100%';
				
				const contrast = this.getContrastForTheme(this.currentTheme);
				slider.min = '20';
				slider.max = '200';
				slider.step = '5';
				slider.value = contrast.toString();
				valueDisplay.setText(`${contrast}%`);
			} else {
				// Switch to brightness mode
				this.sliderMode = 'brightness';
				modeIcon.setText('☀️');
				toggleBtn.setText('◐');
				toggleBtn.title = 'Switch to contrast control';
				resetBtn.title = 'Reset brightness to 0';
				
				const brightness = this.getBrightnessForTheme(this.currentTheme);
				slider.min = '-200';
				slider.max = '100';
				slider.step = '5';
				slider.value = brightness.toString();
				valueDisplay.setText(`${brightness}`);
			}
		});
		
		// Store references for updates
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.statusBarItem as any).slider = slider;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.statusBarItem as any).valueDisplay = valueDisplay;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.statusBarItem as any).modeIcon = modeIcon;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.statusBarItem as any).toggleBtn = toggleBtn;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.statusBarItem as any).resetBtn = resetBtn;
	}

	getCurrentTheme(): string {
		// Get the current theme from app
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const theme = (this.app.vault as any).config?.cssTheme || 'default';
		return theme;
	}

	getBrightnessForTheme(theme: string): number {
		// Check if we have a saved brightness for this theme
		if (this.settings.perThemeBrightness[theme] !== undefined) {
			return this.settings.perThemeBrightness[theme];
		}
		// Fall back to legacy brightness setting or default
		return this.settings.brightnessLevel || 0;
	}

	setBrightnessForTheme(theme: string, brightness: number) {
		this.settings.perThemeBrightness[theme] = brightness;
		this.settings.brightnessLevel = brightness; // Update legacy setting too
	}

	getContrastForTheme(theme: string): number {
		if (this.settings.perThemeContrast[theme] !== undefined) {
			return this.settings.perThemeContrast[theme];
		}
		return this.settings.contrastLevel || 100;
	}

	validateContrast(contrast: number): number {
		// Limit contrast to 20-200% to prevent washout
		return Math.max(20, Math.min(200, contrast));
	}

	setContrastForTheme(theme: string, contrast: number) {
		this.settings.perThemeContrast[theme] = contrast;
		this.settings.contrastLevel = contrast;
	}

	setupThemeWatcher() {
		// Watch for theme changes in the app
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				const newTheme = this.getCurrentTheme();
				if (newTheme !== this.currentTheme) {
					this.currentTheme = newTheme;
					
					// Apply brightness and contrast for new theme
					this.applyBrightness();
					this.applyContrast();
					
					// Update status bar slider
					this.updateStatusBarSlider();
				}
			})
		);
	}

	updateStatusBarSlider() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const slider = (this.statusBarItem as any).slider as HTMLInputElement;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const valueDisplay = (this.statusBarItem as any).valueDisplay as HTMLElement;
		if (slider && valueDisplay) {
			if (this.sliderMode === 'brightness') {
				const brightness = this.getBrightnessForTheme(this.currentTheme);
				slider.value = brightness.toString();
				valueDisplay.setText(`${brightness}`);
			} else {
				const contrast = this.getContrastForTheme(this.currentTheme);
				slider.value = contrast.toString();
				valueDisplay.setText(`${contrast}%`);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure per-theme settings exist (backward compatibility)
		if (!this.settings.perThemeBrightness) {
			this.settings.perThemeBrightness = {};
		}
		if (!this.settings.perThemeContrast) {
			this.settings.perThemeContrast = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyBrightness();
		this.applyContrast();
	}

	applyContrast() {
		const contrast = this.validateContrast(this.getContrastForTheme(this.currentTheme));
		document.body.style.setProperty('filter', `contrast(${contrast}%)`);
	}

	applyBrightness() {
		const brightness = this.getBrightnessForTheme(this.currentTheme);
		
		if (brightness !== 0) {
			// Sample the actual background color from the theme
			const bgColor = getComputedStyle(document.body).getPropertyValue('--background-primary').trim();
			const rgb = this.parseColor(bgColor);
			
			if (rgb) {
				// Calculate overlay color and opacity based on theme color
				let overlayColor: string;
				let overlayOpacity: number;
				
				if (brightness < 0) {
					// Darker: Use a darkened version of the theme color
					// For extreme darkening (-100 to -200), blend more towards pure black
					const absValue = Math.abs(brightness);
					const darkFactor = absValue <= 100 ? 0.3 : Math.max(0, 0.3 - (absValue - 100) * 0.003);
					const darkerRgb = {
						r: Math.max(0, Math.floor(rgb.r * darkFactor)),
						g: Math.max(0, Math.floor(rgb.g * darkFactor)),
						b: Math.max(0, Math.floor(rgb.b * darkFactor))
					};
					overlayColor = `${darkerRgb.r}, ${darkerRgb.g}, ${darkerRgb.b}`;
					// Increase opacity more aggressively for extreme values
					overlayOpacity = absValue <= 100 ? absValue / 100 : Math.min(1, 1 + (absValue - 100) / 200);
				} else {
					// Brighter: Multiply the theme color to make it genuinely brighter
					// Use a multiplier that increases brightness while preserving hue
					const brightFactor = 1 + (brightness / 100) * 1.5; // Max 2.5x brighter at +100
					const brighterRgb = {
						r: Math.min(255, Math.floor(rgb.r * brightFactor)),
						g: Math.min(255, Math.floor(rgb.g * brightFactor)),
						b: Math.min(255, Math.floor(rgb.b * brightFactor))
					};
					overlayColor = `${brighterRgb.r}, ${brighterRgb.g}, ${brighterRgb.b}`;
					overlayOpacity = brightness / 100;
				}
				
				// Update CSS variable - styles.css will use this
				document.body.style.setProperty('--darkslide-overlay', `rgba(${overlayColor}, ${overlayOpacity})`);
			} else {
				// Fallback to black/white if color parsing fails
				const overlayColor = brightness < 0 ? '0, 0, 0' : '255, 255, 255';
				const absValue = Math.abs(brightness);
				const overlayOpacity = absValue <= 100 ? absValue / 100 : Math.min(1, 1 + (absValue - 100) / 200);
				document.body.style.setProperty('--darkslide-overlay', `rgba(${overlayColor}, ${overlayOpacity})`);
			}
		} else {
			// Reset to transparent
			document.body.style.setProperty('--darkslide-overlay', 'rgba(0, 0, 0, 0)');
		}
	}
	
	parseColor(color: string): { r: number; g: number; b: number } | null {
		// Handle hex colors
		if (color.startsWith('#')) {
			const hex = color.replace('#', '');
			if (hex.length === 3) {
				return {
					r: parseInt(hex[0] + hex[0], 16),
					g: parseInt(hex[1] + hex[1], 16),
					b: parseInt(hex[2] + hex[2], 16)
				};
			} else if (hex.length === 6) {
				return {
					r: parseInt(hex.substring(0, 2), 16),
					g: parseInt(hex.substring(2, 4), 16),
					b: parseInt(hex.substring(4, 6), 16)
				};
			}
		}
		
		// Handle rgb/rgba colors
		const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (rgbMatch) {
			return {
				r: parseInt(rgbMatch[1]),
				g: parseInt(rgbMatch[2]),
				b: parseInt(rgbMatch[3])
			};
		}
		
		return null;
	}
}

class BrightnessSettingTab extends PluginSettingTab {
	plugin: DarkSlidePlugin;

	constructor(app: App, plugin: DarkSlidePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl).setName('DarkSlide').setHeading();

		new Setting(containerEl)
			.setName('Show status bar')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBar)
				.onChange(async (value) => {
					this.plugin.settings.showStatusBar = value;
					await this.plugin.saveSettings();
					this.plugin.toggleStatusBar(value);
				}));

		const currentBrightness = this.plugin.getBrightnessForTheme(this.plugin.currentTheme);

		new Setting(containerEl)
			.setName('Brightness')
			.addSlider(slider => slider
				.setLimits(-200, 100, 5)
				.setValue(currentBrightness)
				.setDynamicTooltip()
				.onChange((value) => {
					this.plugin.setBrightnessForTheme(this.plugin.currentTheme, value);
					void this.plugin.saveSettings();
					this.plugin.updateStatusBarSlider();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset')
				.onClick(() => {
					this.plugin.setBrightnessForTheme(this.plugin.currentTheme, 0);
					void this.plugin.saveSettings();
					this.plugin.updateStatusBarSlider();
					this.display();
				}));

		const currentContrast = this.plugin.getContrastForTheme(this.plugin.currentTheme);

		new Setting(containerEl)
			.setName('Contrast')
			.addSlider(slider => slider
				.setLimits(20, 200, 5)
				.setValue(currentContrast)
				.setDynamicTooltip()
				.onChange((value) => {
					this.plugin.setContrastForTheme(this.plugin.currentTheme, value);
					void this.plugin.saveSettings();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset')
				.onClick(() => {
					this.plugin.setContrastForTheme(this.plugin.currentTheme, 100);
					void this.plugin.saveSettings();
					this.display();
				}));
	}
}