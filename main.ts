import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface BrightnessSettings {
	brightnessLevel: number; // -200 to 100, where 0 is no change (legacy)
	perThemeBrightness: Record<string, number>; // Per-theme brightness settings
}

const DEFAULT_SETTINGS: BrightnessSettings = {
	brightnessLevel: 0,
	perThemeBrightness: {}
}

export default class DarkSlidePlugin extends Plugin {
	settings: BrightnessSettings;
	statusBarItem: HTMLElement;
	currentTheme: string = '';

	async onload() {
		await this.loadSettings();

		// Get current theme
		this.currentTheme = this.getCurrentTheme();

		// Apply initial brightness for current theme
		this.applyBrightness();

		// Add status bar slider
		this.createStatusBarSlider();

		// Watch for theme changes
		this.setupThemeWatcher();

		// Add settings tab
		this.addSettingTab(new BrightnessSettingTab(this.app, this));

		// Add ribbon icon for quick access
		this.addRibbonIcon('sun', 'Adjust Background Brightness', () => {
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById('darkslide');
		});
	}

	onunload() {
		// Reset CSS variable on unload
		document.body.style.removeProperty('--darkslide-overlay');
	}

	createStatusBarSlider() {
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('brightness-status-bar');
		
		// Create container with icon and slider
		const container = this.statusBarItem.createEl('div', {
			cls: 'brightness-slider-container'
		});
		
		// Add sun icon
		const icon = container.createEl('span', {
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
		resetBtn.title = 'Reset to default (0)';
		
		// Handle slider change
		slider.addEventListener('input', async (e) => {
			const value = parseInt((e.target as HTMLInputElement).value);
			this.setBrightnessForTheme(this.currentTheme, value);
			valueDisplay.setText(`${value}`);
			this.applyBrightness();
		});
		
		// Save on mouse up
		slider.addEventListener('mouseup', async () => {
			await this.saveSettings();
		});
		
		// Also save on touch end for mobile
		slider.addEventListener('touchend', async () => {
			await this.saveSettings();
		});
		
		// Reset button handler
		resetBtn.addEventListener('click', async () => {
			this.setBrightnessForTheme(this.currentTheme, 0);
			slider.value = '0';
			valueDisplay.setText('0');
			this.applyBrightness();
			await this.saveSettings();
		});
		
		// Store references for updates
		(this.statusBarItem as any).slider = slider;
		(this.statusBarItem as any).valueDisplay = valueDisplay;
	}

	getCurrentTheme(): string {
		// Get the current theme from app
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

	setupThemeWatcher() {
		// Watch for theme changes in the app
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				const newTheme = this.getCurrentTheme();
				if (newTheme !== this.currentTheme) {
					this.currentTheme = newTheme;
					
					// Apply brightness for new theme
					this.applyBrightness();
					
					// Update status bar slider
					this.updateStatusBarSlider();
				}
			})
		);
	}

	updateStatusBarSlider() {
		const slider = (this.statusBarItem as any).slider as HTMLInputElement;
		const valueDisplay = (this.statusBarItem as any).valueDisplay as HTMLElement;
		if (slider && valueDisplay) {
			const brightness = this.getBrightnessForTheme(this.currentTheme);
			slider.value = brightness.toString();
			valueDisplay.setText(`${brightness}`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure perThemeBrightness exists (backward compatibility)
		if (!this.settings.perThemeBrightness) {
			this.settings.perThemeBrightness = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyBrightness();
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
					// Brighter: Use a lightened version of the theme color
					// Blend toward lighter version of same hue
					const lighterRgb = {
						r: Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * 0.7)),
						g: Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * 0.7)),
						b: Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * 0.7))
					};
					overlayColor = `${lighterRgb.r}, ${lighterRgb.g}, ${lighterRgb.b}`;
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

		containerEl.createEl('h2', {text: 'DarkSlide'});

	containerEl.createEl('p', {
		text: 'Adjust the brightness of background colors in your current theme. Negative values make it darker (down to -200 for pure black), positive values make it brighter.',
		cls: 'setting-item-description'
	});

		// Show current theme
		containerEl.createEl('p', {
			text: `Current theme: ${this.plugin.currentTheme || 'default'}`,
			cls: 'setting-item-description'
		});
		containerEl.createEl('p', {
			text: 'Brightness settings are saved per-theme.',
			cls: 'setting-item-description'
		});

		const currentBrightness = this.plugin.getBrightnessForTheme(this.plugin.currentTheme);

		// Create a div to show the current brightness value
		const valueDisplay = containerEl.createEl('div', {
			text: `Current brightness: ${currentBrightness}%`,
			cls: 'brightness-value-display'
		});

		new Setting(containerEl)
			.setName('Brightness Level')
			.setDesc('Adjust background brightness for current theme (-200 = pure black, 0 = normal, +100 = brightest)')
			.addSlider(slider => slider
				.setLimits(-200, 100, 5)
				.setValue(currentBrightness)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.setBrightnessForTheme(this.plugin.currentTheme, value);
					await this.plugin.saveSettings();
					valueDisplay.setText(`Current brightness: ${value}%`);
					this.plugin.updateStatusBarSlider();
				}));

		// Add a reset button
		new Setting(containerEl)
			.setName('Reset to Default')
			.setDesc('Reset brightness to 0 (no change) for current theme')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.plugin.setBrightnessForTheme(this.plugin.currentTheme, 0);
					await this.plugin.saveSettings();
					this.plugin.updateStatusBarSlider();
					this.display(); // Refresh the settings tab
				}));

		// Add some helpful tips
		containerEl.createEl('h3', {text: 'Tips'});
		const tipsList = containerEl.createEl('ul');
	tipsList.createEl('li', {text: 'Use negative values (-50 to -200) to make dark themes darker (extreme values approach pure black)'});
		tipsList.createEl('li', {text: 'Use positive values (+20 to +50) to brighten overly dark themes'});
		tipsList.createEl('li', {text: 'Changes are applied immediately as you move the slider'});
		tipsList.createEl('li', {text: 'Settings are saved per vault'});
	}
}