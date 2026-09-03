package ru.alliby.app;

/**
 * Второй вариант виджета в системном пикере — тот же провайдер, только с другим
 * дефолтным размером при добавлении (alliby_widget_info_tall.xml, 5 ячеек по вертикали).
 * Вся логика унаследована от AllibyWidgetProvider — отдельный класс существует
 * только потому, что Android различает виджеты в пикере по компоненту-получателю.
 */
public class AllibyWidgetProviderTall extends AllibyWidgetProvider {
}
