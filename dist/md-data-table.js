angular.module('md.data.table', ['md.table.templates']);

angular.module('md.data.table')

.directive('mdDataTable', function () {
  'use strict';
  
  function compile(tElement, tAttrs) {
    var head = tElement.find('thead');
    var body = tElement.find('tbody');
    var foot = tElement.find('tfoot');
    
    // make sure the table has a head element
    if(!head.length) {
      head = tElement.find('tbody').eq(0);
      
      if(head.children().find('th').length) {
        head.replaceWith('<thead>' + head.html() + '</thead>');
      } else {
        throw new Error('mdDataTable', 'Expecting <thead></thead> element.');
      }
      
      head = tElement.find('thead');
      body = tElement.find('tbody');
    }
    
    // notify the children to begin work
    head.attr('md-table-head', '');
    body.attr('md-table-body', '');
    
    if(foot.length) {
      foot.attr('md-table-foot', '');
      
      if(tAttrs.mdRowSelect) {
        foot.find('tr').prepend('<td></td>');
      }
    }
    
    // log rudimentary warnings for the developer
    if(!body.children().attr('ng-repeat')) {
      if(tAttrs.mdRowSelect) {
        console.warn('Use ngRepeat to enable automatic row selection.');
      }
      if(head.attr('md-order')) {
        console.warn('Column ordering without ngRepeat is not supported by this directive.');
      }
    }
  }
  
  return {
    bindToController: {
      progress: '=mdProgress',
      selectedItems: '=mdRowSelect'
    },
    compile: compile,
    controller: 'mdDataTableController',
    controllerAs: 'tableCtrl',
    restrict: 'A',
    scope: {}
  };
})

.controller('mdDataTableController', ['$attrs', '$element', '$q', '$scope', function ($attrs, $element, $q, $scope) {
  'use strict';

  var self = this;

  if($attrs.mdRowSelect && !angular.isArray(self.selectedItems)) {
    self.selectedItems = [];
    // log warning for developer
    console.warn('md-row-select="' + $attrs.mdRowSelect + '" : ' +
    $attrs.mdRowSelect + ' is not defined as an array in your controller, ' +
    'i.e. ' + $attrs.mdRowSelect + ' = [], two-way data binding will fail.');
  }
  
  if($attrs.mdProgress) {
    $scope.$watch('tableCtrl.progress', function () {
      var deferred = self.defer();
      $q.when(self.progress)['finally'](deferred.resolve);
    });
  }

  self.columns = [];
  self.classes = [];
  self.repeatEnd = [];

  // support theming
  ['md-primary', 'md-hue-1', 'md-hue-2', 'md-hue-3'].forEach(function(mdClass) {
    if($element.hasClass(mdClass)) {
      self.classes.push(mdClass);
    }
  });

  self.defer = function () {
    if(self.deferred) {
      self.deferred.reject('cancel');
    } else {
      self.showProgress();
    }

    self.deferred = $q.defer();
    self.deferred.promise.then(self.resolve);

    return self.deferred;
  };

  self.resolve = function () {
    self.deferred = undefined;
    self.hideProgress();
  };
  
  self.repeatEnd.push(function (ngRepeat) {
    if(!self.listener && $attrs.mdRowSelect) {
      self.listener = $scope.$parent.$watch(ngRepeat.items, function (newValue, oldeValue) {
        if(newValue !== oldeValue) {
          self.selectedItems.splice(0);
        }
      });
    }
  });
  
  self.onRepeatEnd = function (ngRepeat) {
    self.repeatEnd.forEach(function (listener) {
      listener(ngRepeat);
    });
  };

  self.setColumns = function (cell) {
    if(!cell.attributes.numeric) {
      return self.columns.push({ isNumeric: false });
    }
    
    self.columns.push({
      isNumeric: true,
      unit: cell.attributes.unit ? cell.attributes.unit.value : undefined,
    });
  };

  angular.forEach($element.find('th'), self.setColumns);
}]);

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


angular.module('md.data.table').directive('mdTableFoot', function () {
  'use strict';

  function postLink(scope, element, attrs, tableCtrl) {
    var cells = element.find('td');
    
    tableCtrl.columns.forEach(function(column, index) {
      if(column.isNumeric) {
        cells.eq(index).addClass('numeric');
      }
    });
    
    if(cells.length < tableCtrl.columns.length) {
      element.find('tr').append('<td colspan="' + (tableCtrl.columns.length - cells.length) + '"></td>');
    }
  }
  
  return {
    require: '^mdDataTable',
    link: postLink
  };
});

angular.module('md.data.table').directive('mdTableHead', ['$document', '$mdTable', '$q', '$filter', function ($document, $mdTable, $q, $filter) {
  'use strict';

  function postLink(scope, element, attrs, tableCtrl) {
    
    // table progress
    if(angular.isFunction(scope.trigger)) {
      scope.headCtrl.pullTrigger = function () {
        var deferred = tableCtrl.defer();
        $q.when(scope.trigger(scope.headCtrl.order))['finally'](deferred.resolve);
      };
    }
    
    // trim column names
    if(attrs.hasOwnProperty('mdTrimColumnNames')) {
      var div = angular.element('<div></div>').css({
        position: 'absolute',
        fontSize: '12px',
        fontWeight : 'bold',
        visibility: 'hidden'
      });
      
      $document.find('body').append(div);
      
      angular.forEach(element.find('th'), function(cell, index) {
        if(index === 0 || element.parent().attr('md-row-select') && index === 1) {
          return;
        }
        
        var trim = cell.querySelector('trim');
        
        div.html(trim.innerText);
        
        trim.width = div.prop('clientWidth');
        
        cell.addEventListener('mouseenter', function () {
          var trim = this.querySelector('trim');
          var iconWidth = this.querySelector('md-icon') ? 26 : 0;
          
          if(trim.width > (this.clientWidth - iconWidth - 56)) {
            trim.style.minWidth = Math.min(trim.width, this.clientWidth - iconWidth - 28) + 'px';
            this.firstChild.style.color = 'rgba(0, 0, 0, 0.87)';
            this.firstChild.style.overflow = 'visible';
          }
        });
        
        cell.addEventListener('mouseleave', function () {
          this.querySelector('trim').style.minWidth = '';
          this.firstChild.style.color = '';
          this.firstChild.style.overflow = '';
        });
      });
      
      div.remove();
    }
  }
  
  function compile(tElement, tAttrs) {
    
    angular.forEach(tElement.find('th'), function (cell) {
      
      // right align numeric cells
      if(cell.hasAttribute('numeric')) {
        cell.style.textAlign = 'right';
        
        // append unit to column name
        if(cell.hasAttribute('unit')) {
          cell.innerHTML += ' ' + '(' + cell.getAttribute('unit') + ')';
        }
      }
      
      // trim long column names
      if(tAttrs.hasOwnProperty('mdTrimColumnNames')) {
        cell.innerHTML = '<trim>' + cell.innerHTML + '</trim>';
      }
    });
    
    // ensures a minimum width of 64px for column names
    if(tAttrs.hasOwnProperty('mdTrimColumnNames')) {
      var minWidth = 120 * tElement.find('th').length;
      
      if(tElement.parent().attr('md-row-select')) {
        minWidth += 66;
      }
      
      tElement.parent().css({
        'min-width': minWidth + 'px',
        'table-layout': 'fixed'
      });
    }
    
    // enable row selection
    if(tElement.parent().attr('md-row-select')) {
      var ngRepeat = tElement.parent().find('tbody').find('tr').attr('ng-repeat');
      
      if(ngRepeat) {
        var mdTableRepeat = $mdTable.parse(ngRepeat);
        var items = mdTableRepeat.items;
        var filter = mdTableRepeat.filter;
        var checkbox = angular.element('<md-checkbox></md-checkbox>');
        
        checkbox.attr('aria-label', 'Select All');
        checkbox.attr('ng-click', 'toggleAll(' + items + ',' + filter + ')');
        checkbox.attr('ng-class', '[mdClasses, {\'md-checked\': allSelected()}]');
        checkbox.attr('ng-disabled', '!getCount(' + items + ',' + filter + ')');
        
        tElement.find('tr').prepend(angular.element('<th></th>').append(checkbox));
      }
    }
    
    tElement.after('<thead md-table-progress></thead>');
    
    return postLink;
  }
  
  return {
    bindToController: {
      order: '=mdOrder'
    },
    controller: function () {},
    controllerAs: 'headCtrl',
    require: '^mdDataTable',
    scope: {
      trigger: '=mdTrigger'
    },
    compile: compile
  };
}]);


angular.module('md.data.table').directive('orderBy', ['$interpolate', '$timeout', function ($interpolate, $timeout) {
  'use strict';

  function template(tElement) {
    return '<th ng-click="setOrder()" ng-class="{\'md-active\': isActive()}">' + tElement.html() + '</th>';
  }

  function postLink(scope, element, attrs, headCtrl) {
    
    if(angular.isDefined(attrs.descendFirst)) {
      attrs.$set('descendFirst', true);
    }

    if(element.text().match(/{{[^}]+}}/)) {
      var text = $interpolate('\'' + element.text() + '\'')(scope.$parent);
      var trim = element.find('trim');

      if(trim.length) {
        trim.text(text.slice(1, -1));
      } else if(angular.isDefined(attrs.numeric)) {
        element.find('div').append(text.slice(1, -1));
      } else {
        element.find('div').prepend(text.slice(1, -1));
      }
    }

    scope.getDirection = function () {
      if(scope.isActive()) {
        return headCtrl.order[0] === '-' ? 'down' : 'up';
      }
      return attrs.descendFirst ? 'down' : 'up';
    };

    scope.isActive = function () {
      return headCtrl.order === scope.order || headCtrl.order === '-' + scope.order;
    };

    scope.setOrder = function () {
      if(scope.isActive()) {
        headCtrl.order = headCtrl.order === scope.order ? '-' + scope.order : scope.order;
      } else {
        headCtrl.order = attrs.descendFirst ? '-' + scope.order : scope.order;
      }
      
      if(headCtrl.pullTrigger) {
        $timeout(headCtrl.pullTrigger);
      }
    };
  }

  function compile(tElement, tAttrs) {
    var sortIcon = angular.element('<md-icon></md-icon>');

    sortIcon.attr('md-svg-icon', 'templates.arrow.html');
    sortIcon.attr('ng-class', 'getDirection()');

    if(angular.isDefined(tAttrs.numeric)) {
      tElement.prepend(sortIcon);
    } else {
      tElement.append(sortIcon);
    }

    tElement.html('<div>' + tElement.html() + '</div>');

    return postLink;
  }

  return {
    compile: compile,
    replace: true,
    require: '^mdTableHead',
    restrict: 'A',
    scope: {
      order: '@orderBy'
    },
    template: template
  };
}]);

angular.module('md.data.table')

.directive('mdDataTablePagination', ['$q', function ($q) {
  'use strict';

  function postLink(scope, element, attrs) {
    scope.paginationLabel = {
      text: 'Rows per page:',
      of: 'of'
    };

    if(angular.isObject(scope.label)) {
      angular.extend(scope.paginationLabel, scope.label);
    }

    // table progress
    if(angular.isFunction(scope.trigger)) {

      // the pagination directive is outside the table directive so we need
      // to locate the controller
      var findTable = function(element, callback) {
        while(element.localName !== 'md-data-table-container' && element.previousElementSibling) {
          parent = parent.previousElementSibling;
        }
        callback(angular.element(element.firstElementChild));
      };

      var setTrigger = function(table) {
        var tableCtrl = table.controller('mdDataTable');

        if(!tableCtrl) {
          return console.warn('Table Pagination: Could not locate your table directive, your ' + attrs.mdTrigger + ' function will not work.');
        }

        scope.pullTrigger = function () {
          var deferred = tableCtrl.defer();
          $q.when(scope.trigger(scope.page, scope.limit))['finally'](deferred.resolve);
        };
      };

      findTable(element.prop('previousElementSibling'), setTrigger);
    }
  }

  return {
    controller: 'mdPaginationCtrl',
    scope: {
      label: '=mdLabel',
      limit: '=mdLimit',
      page: '=mdPage',
      rowSelect: '=mdRowSelect',
      total: '@mdTotal',
      trigger: '=mdTrigger'
    },
    templateUrl: 'templates.md-data-table-pagination.html',
    link: postLink
  };
}])

.controller('mdPaginationCtrl', ['$scope', '$timeout', function ($scope, $timeout) {
  'use strict';

  var min = 1;

  $scope.hasNext = function () {
    return (($scope.page * $scope.limit) < $scope.total);
  };

  $scope.hasPrevious = function () {
    return ($scope.page > 1);
  };

  $scope.next = function () {
    $scope.page++;

    if($scope.pullTrigger) {
      $timeout($scope.pullTrigger);
    }

    min = $scope.min();
  };

  $scope.last = function () {
    $scope.page = Math.ceil($scope.total / $scope.limit);

    if($scope.pullTrigger) {
      $timeout($scope.pullTrigger);
    }

    min = $scope.min();
  };

  $scope.min = function () {
    return ((($scope.page - 1) * $scope.limit) + 1);
  };

  $scope.max = function () {
    return $scope.hasNext() ? $scope.page * $scope.limit : $scope.total;
  };

  $scope.onSelect = function () {
    $scope.page = Math.floor(min / $scope.limit) + 1;

    if($scope.pullTrigger) {
      $timeout($scope.pullTrigger);
    }

    min = $scope.min();
    while((min > $scope.total) && $scope.hasPrevious()) {
      $scope.previous();
    }
  };

  $scope.previous = function () {
    $scope.page--;

    if($scope.pullTrigger) {
      $timeout($scope.pullTrigger);
    }

    min = $scope.min();
  };

  $scope.first = function () {
    $scope.page = 1;

    if($scope.pullTrigger) {
      $timeout($scope.pullTrigger);
    }

    min = $scope.min();
  };

}]);


angular.module('md.data.table').directive('mdTableProgress', function () {
  'use strict';
  
  function postLink(scope, element, attrs, tableCtrl) {
    
    scope.getColumnCount = function () {
      return tableCtrl.columns.length;
    };
    
    tableCtrl.hideProgress = function () {
      scope.showProgress = false;
    };
    
    tableCtrl.showProgress = function () {
      scope.showProgress = true;
    };
  }
  
  return {
    link: postLink,
    require: '^mdDataTable',
    replace: true,
    templateUrl: 'templates.md-data-table-progress.html'
  };
});


angular.module('md.data.table')

.directive('mdTableRow', ['$mdTable', '$timeout', function ($mdTable, $timeout) {
  'use strict';

  function postLink(scope, element, attrs, tableCtrl) {
    
    if(element.parent().parent().attr('md-row-select')) {
      var disable = element.parent().attr('md-disable-select');
      
      if(scope.$last && !tableCtrl.listener) {
        tableCtrl.onRepeatEnd($mdTable.parse(attrs.ngRepeat));
      }
      
      var isDisabled = function() {
        return disable ? scope.$eval(disable) : false;
      };
      
      scope.isSelected = function (item) {
        return tableCtrl.selectedItems.indexOf(item) !== -1;
      };
      
      scope.toggleRow = function (item, event) {
        event.stopPropagation();
        
        if(isDisabled()) {
          return;
        }
        
        if(scope.isSelected(item)) {
          tableCtrl.selectedItems.splice(tableCtrl.selectedItems.indexOf(item), 1);
        } else {
          tableCtrl.selectedItems.push(item);
        }
      };
    }
    
    tableCtrl.columns.forEach(function (column, index) {
      if(column.isNumeric) {
        var cell = element.children().eq(index);
        
        cell.addClass('numeric');
        
        if(angular.isDefined(cell.attr('show-unit'))) {
          $timeout(function () {
            cell.text(cell.text() + tableCtrl.columns[index].unit);
          });
        }
      }
    });
  }
  
  return {
    link: postLink,
    require: '^^mdDataTable'
  };
}])

.directive('mdTableRepeat', ['$mdTable', function ($mdTable) {
  'use strict';
  
  function compile(tElement, tAttrs) {
    var item = $mdTable.parse(tAttrs.ngRepeat).item;
    var checkbox = angular.element('<md-checkbox></md-checkbox>');
    
    checkbox.attr('aria-label', 'Select Row');
    checkbox.attr('ng-click', 'toggleRow(' + item + ', $event)');
    checkbox.attr('ng-class', '[mdClasses, {\'md-checked\': isSelected(' + item + ')}]');
    
    if(tElement.parent().attr('md-disable-select')) {
      checkbox.attr('ng-disabled', tElement.parent().attr('md-disable-select'));
    }
    
    tElement.prepend(angular.element('<td></td>').append(checkbox));
    
    if(angular.isDefined(tElement.parent().attr('md-auto-select'))) {
      tAttrs.$set('ngClick', 'toggleRow(' + item + ', $event)');
    }
    
    tAttrs.$set('ngClass', '{\'md-selected\': isSelected(' + item + ')}');
  }
  
  return {
    compile: compile,
    priority: 1001
  };
}]);

angular.module('md.data.table').factory('$mdTable', function () {
  'use strict';
  
  var cache = {};
  
  function Repeat(ngRepeat) {
    this._tokens = ngRepeat.split(' ');
    this._iterator = 0;
    
    this.filter = null;

    this.item = this.current();
    while(this.hasNext() && this.getNext() !== 'in') {
      this.item += this.current();
    }
    
    this.items = this.getNext();
    while(this.hasNext() && ['|', 'track'].indexOf(this.getNext()) === -1) {
      this.items += this.current();
    }

    try {
        this.filter = ngRepeat.match(/filter:([^ |]+)/)[1];
    }
    catch(e) {}
  }
  
  Repeat.prototype.current = function () {
    return this._tokens[this._iterator];
  };
  
  Repeat.prototype.getNext = function() {
    return this._tokens[++this._iterator];
  };
  
  Repeat.prototype.getValue = function() {
    return this._tokens.join(' ');
  };
  
  Repeat.prototype.hasNext = function () {
    return this._iterator < this._tokens.length - 1;
  };
  
  function parse(ngRepeat) {
    if(!cache.hasOwnProperty(ngRepeat)) {
      return (cache[ngRepeat] = new Repeat(ngRepeat));
    }
    
    return cache[ngRepeat];
  }
  
  return {
    parse: parse
  };
  
});


angular.module('md.table.templates', ['templates.arrow.html', 'templates.navigate-before.html', 'templates.navigate-first.html', 'templates.navigate-last.html', 'templates.navigate-next.html', 'templates.md-data-table-pagination.html', 'templates.md-data-table-progress.html']);

angular.module('templates.arrow.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.arrow.html',
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path d="M3,9 L4.06,10.06 L8.25,5.87 L8.25,15 L9.75,15 L9.75,5.87 L13.94,10.06 L15,9 L9,3 L3,9 L3,9 Z"/></svg>');
}]);

angular.module('templates.navigate-before.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.navigate-before.html',
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>\n' +
    '');
}]);

angular.module('templates.navigate-first.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.navigate-first.html',
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 6 v12 h2 v-12 h-2z M17.41 7.41L16 6l-6 6 6 6 1.41-1.41L12.83 12z"/></svg>\n' +
    '');
}]);

angular.module('templates.navigate-last.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.navigate-last.html',
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M15 6 v12 h2 v-12 h-2z M8 6L6.59 7.41 11.17 12l-4.58 4.59L8 18l6-6z"/></svg>\n' +
    '');
}]);

angular.module('templates.navigate-next.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.navigate-next.html',
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>\n' +
    '');
}]);

angular.module('templates.md-data-table-pagination.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.md-data-table-pagination.html',
    '<div>\n' +
    '  <span class="label">{{paginationLabel.text}}</span>\n' +
    '  <md-select ng-model="limit" ng-change="onSelect()" aria-label="Row Count" placeholder="{{rowSelect ? rowSelect[0] : 5}}">\n' +
    '    <md-option ng-repeat="rows in rowSelect ? rowSelect : [5, 10, 15]" ng-value="rows">{{rows}}</md-option>\n' +
    '  </md-select>\n' +
    '  <span>{{min()}} - {{max()}} {{paginationLabel.of}} {{total}}</span>\n' +
    '</div>\n' +
    '<div>\n' +
    '  <md-button ng-click="first()" ng-disabled="!hasPrevious()" aria-label="First">\n' +
    '    <md-icon md-svg-icon="templates.navigate-first.html"></md-icon>\n' +
    '  </md-button>\n' +
    '  <md-button ng-click="previous()" ng-disabled="!hasPrevious()" aria-label="Previous">\n' +
    '    <md-icon md-svg-icon="templates.navigate-before.html"></md-icon>\n' +
    '  </md-button>\n' +
    '  <md-button ng-click="next()" ng-disabled="!hasNext()" aria-label="Next">\n' +
    '    <md-icon md-svg-icon="templates.navigate-next.html"></md-icon>\n' +
    '  </md-button>\n' +
    '  <md-button ng-click="last()" ng-disabled="!hasNext()" aria-label="Last">\n' +
    '    <md-icon md-svg-icon="templates.navigate-last.html"></md-icon>\n' +
    '  </md-button>\n' +
    '</div>\n' +
    '');
}]);

angular.module('templates.md-data-table-progress.html', []).run(['$templateCache', function($templateCache) {
  'use strict';
  $templateCache.put('templates.md-data-table-progress.html',
    '<thead ng-if="showProgress">\n' +
    '  <tr>\n' +
    '    <th colspan="{{getColumnCount()}}">\n' +
    '      <md-progress-linear md-mode="indeterminate"></md-progress-linear>\n' +
    '    </th>\n' +
    '  </tr>\n' +
    '</thead>');
}]);
