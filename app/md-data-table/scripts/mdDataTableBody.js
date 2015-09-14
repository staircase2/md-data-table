angular.module('md.data.table').directive('mdTableBody', ['$filter', function ($filter) {
  'use strict';
  
  function postLink(scope, element, attrs, tableCtrl) {
    
    // row selection
    if(element.parent().attr('md-row-select')) {
      scope.$parent.mdClasses = tableCtrl.classes;
      
      tableCtrl.repeatEnd.push(function (ngRepeat) {
        var model = {};
        var count = 0;
        
        var getSelectableItems = function(items, filter) {
          return $filter('filter')(items.filter(function (item) {
            model[ngRepeat.item] = item;
            return !scope.disable(model);
          }), filter);
        };
        
        scope.$parent.getCount = function(items, filter) {
          var filtered = $filter('filter')(items, filter);
          return (count = filtered.reduce(function(sum, item) {
            model[ngRepeat.item] = item;
            return scope.disable(model) ? sum : ++sum;
          }, 0));
        };
        
        scope.$parent.allSelected = function () {
          return count && count === tableCtrl.selectedItems.length;
        };
        
        scope.$parent.toggleAll = function (items, filter) {
          var selectableItems = getSelectableItems(items, filter);
          
          if(selectableItems.length === tableCtrl.selectedItems.length) {
            tableCtrl.selectedItems.splice(0);
          } else {
            tableCtrl.selectedItems = selectableItems;
          }
        };
      });
    }
  }
  
  function compile(tElement) {
    tElement.find('tr').attr('md-table-row', '');
    
    if(tElement.find('tr').attr('ng-repeat') && tElement.parent().attr('md-row-select')) {
      tElement.find('tr').attr('md-table-repeat', '');
    }
    
    return postLink;
  }

  return {
    compile: compile,
    require: '^mdDataTable',
    scope: {
      disable: '&mdDisableSelect'
    }
  };
}]);
