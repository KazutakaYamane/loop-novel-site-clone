<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $work_id
 * @property int $position
 * @property string $name
 */
#[Fillable(['position', 'name'])]
class Tag extends Model
{
    public $timestamps = false;
}
